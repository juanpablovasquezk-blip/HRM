import React from 'react';
import { getActiveDocumentDefinitions, getWorkerDocuments, getWorkerSession } from '../../actions';
import { redirect } from 'next/navigation';
import WorkerDocumentsClient from './documents-client';

export default async function WorkerDocumentsPage() {
  const session = await getWorkerSession();
  if (!session) redirect('/worker/login');

  const [definitions, existingDocuments] = await Promise.all([
    getActiveDocumentDefinitions(),
    getWorkerDocuments()
  ]);

  return (
    <div className="pb-8">
      <WorkerDocumentsClient 
        definitions={definitions} 
        existingDocuments={existingDocuments} 
        userId={session.id}
      />
    </div>
  );
}
