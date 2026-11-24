import { NextRequest, NextResponse } from 'next/server';
import { requireActionAuth } from '@/lib/auth/action-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  compareEnginesPreviewStaged,
  type PreviewCompareStage,
} from '@/lib/scheduler/v2/preview-compare';
import { loadPreviewCompareInputs } from '@/lib/scheduler/v2/preview-compare-server';

const STAGE_LABELS: Record<PreviewCompareStage, string> = {
  loading_data: 'Cargando datos',
  calculating_v1: 'Calculando v1',
  calculating_v2: 'Calculando v2',
  preparing_comparison: 'Preparando comparación',
};

export async function POST(req: NextRequest) {
  const auth = await requireActionAuth({ permission: 'runScheduler' });
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 403 }
    );
  }

  let body: {
    startDate?: string;
    endDate?: string;
    areaId?: string;
    personnelIds?: string[];
    positionFilter?: string | string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Solicitud inválida para comparar motores.' },
      { status: 400 }
    );
  }

  const { startDate, endDate, areaId, personnelIds, positionFilter } = body;
  if (!startDate || !endDate || startDate > endDate) {
    return NextResponse.json(
      { success: false, error: 'Rango de fechas inválido.' },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const workController = new AbortController();
  const onReqAbort = () => workController.abort();
  if (req.signal.aborted) {
    workController.abort();
  } else {
    req.signal.addEventListener('abort', onReqAbort, { once: true });
  }

  const stream = new ReadableStream({
    cancel() {
      workController.abort();
    },
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (workController.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // stream already closed
        }
      };

      const totalStart = performance.now();
      let currentStage: PreviewCompareStage = 'loading_data';
      const SERVER_LIMIT_MS = 115_000;
      let timedOut = false;
      const watchdog = setTimeout(() => {
        timedOut = true;
        send({
          type: 'error',
          stage: currentStage,
          error: `Límite de ejecución (${SERVER_LIMIT_MS / 1000} s) excedido en la etapa «${STAGE_LABELS[currentStage]}».`,
        });
        workController.abort();
        try {
          controller.close();
        } catch {
          // ignore if already closed
        }
      }, SERVER_LIMIT_MS);

      try {
        send({
          type: 'stage',
          stage: 'loading_data',
          label: STAGE_LABELS.loading_data,
        });

        const supabase = createAdminClient();
        const loaded = await loadPreviewCompareInputs(supabase, {
          startDate,
          endDate,
          areaId,
          personnelIds,
          positionFilter,
        });

        if (timedOut || workController.signal.aborted) return;

        if (!loaded.ok) {
          send({ type: 'error', stage: currentStage, error: loaded.error });
          return;
        }

        const comparison = await compareEnginesPreviewStaged(
          {
            ...loaded.compareParams,
            deadlineAt: Date.now() + SERVER_LIMIT_MS,
            signal: workController.signal,
          },
          (stage) => {
            if (timedOut || workController.signal.aborted) {
              throw new Error(`Cálculo interrumpido en la etapa «${STAGE_LABELS[currentStage]}».`);
            }
            currentStage = stage;
            send({
              type: 'stage',
              stage,
              label: STAGE_LABELS[stage],
            });
          }
        );

        if (timedOut || workController.signal.aborted) return;

        const totalMs = Math.round((performance.now() - totalStart) * 100) / 100;
        send({
          type: 'result',
          comparison,
          totalMs,
        });
      } catch (err) {
        if (!timedOut && !workController.signal.aborted) {
          send({
            type: 'error',
            stage: currentStage,
            error:
              err instanceof Error
                ? `${err.message} (etapa: ${STAGE_LABELS[currentStage]})`
                : `Error inesperado en la etapa «${STAGE_LABELS[currentStage]}».`,
          });
        }
      } finally {
        clearTimeout(watchdog);
        req.signal.removeEventListener('abort', onReqAbort);
        if (!timedOut) {
          try {
            controller.close();
          } catch {
            // ignore if already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
