import React from 'react';
import { getDocumentDefinitions, getPositions } from './actions';
import DocumentsClient from './documents-client';

export default async function DocumentsSettingsPage() {
  const [definitions, positions] = await Promise.all([
    getDocumentDefinitions(),
    getPositions()
  ]);

  return (
    <div className="max-w-4xl mx-auto py-4">
      <DocumentsClient 
        initialDefinitions={definitions} 
        positions={positions}
      />
    </div>
  );
}
