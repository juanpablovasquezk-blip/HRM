import React, { Suspense } from 'react';
import {
  getActiveDocumentDefinitions,
  getWorkerDocumentDirectTarget,
  getWorkerDocuments,
  getWorkerSession,
} from '../../actions';
import { redirect } from 'next/navigation';
import WorkerDocumentsClient from './documents-client';
import { getSantiagoDateString } from '@/lib/worker/portal-requests';

function DocumentsListSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-lg mx-auto animate-pulse">
      <div className="h-6 w-44 rounded bg-slate-200" />
      {[1, 2].map((i) => (
        <div key={i} className="rounded-3xl bg-white p-5 border border-slate-100 space-y-3">
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="h-3 w-52 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

async function FullDocumentsList({
  userId,
  personnel,
  todayStr,
}: {
  userId: string;
  personnel: any;
  todayStr: string;
}) {
  const [definitions, existingDocuments] = await Promise.all([
    getActiveDocumentDefinitions(),
    getWorkerDocuments(),
  ]);

  return (
    <WorkerDocumentsClient
      definitions={definitions}
      existingDocuments={existingDocuments}
      userId={userId}
      personnel={personnel}
      renderMode="list_only"
      todayStr={todayStr}
    />
  );
}

export default async function WorkerDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ definitionId?: string }>;
}) {
  const session = await getWorkerSession();
  if (!session) redirect('/worker/login');

  const params = await searchParams;
  const definitionId = params?.definitionId?.trim() || '';
  const todayStr = getSantiagoDateString();

  if (definitionId) {
    const direct = await getWorkerDocumentDirectTarget(definitionId);
    return (
      <div className="pb-8">
        {direct.definition && (
          <WorkerDocumentsClient
            definitions={[direct.definition]}
            existingDocuments={direct.document ? [direct.document] : []}
            userId={session.id}
            personnel={session}
            initialDefinitionId={definitionId}
            renderMode="dialog_only"
            todayStr={todayStr}
          />
        )}
        <Suspense fallback={<DocumentsListSkeleton />}>
          <FullDocumentsList userId={session.id} personnel={session} todayStr={todayStr} />
        </Suspense>
      </div>
    );
  }

  const [definitions, existingDocuments] = await Promise.all([
    getActiveDocumentDefinitions(),
    getWorkerDocuments(),
  ]);

  return (
    <div className="pb-8">
      <WorkerDocumentsClient
        definitions={definitions}
        existingDocuments={existingDocuments}
        userId={session.id}
        personnel={session}
        renderMode="full"
        todayStr={todayStr}
      />
    </div>
  );
}
