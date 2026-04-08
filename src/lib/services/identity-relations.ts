import type { ClientDependantRecord, ClientEntityRecord } from "@/lib/api/types";
import type {
  IdentityRelationKind,
  IdentityRelationRecord,
  IdentityRelationSavePayload,
} from "@/lib/api/contracts/identity-relations";
import {
  deleteIdentityRelationItem,
  saveIdentityRelationCollection,
} from "@/lib/api/adapters/identity-relations";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

function normalizeOwner(value?: { id?: string | null; name?: string | null } | null) {
  return value
    ? {
        id: value.id ?? null,
        name: value.name ?? null,
      }
    : null;
}

function buildSavePayload<K extends IdentityRelationKind>(
  kind: K,
  records: Array<IdentityRelationRecord<K>>,
): IdentityRelationSavePayload<K> {
  const request = records.map((record) => {
    if (kind === "entities") {
      const entity = record as ClientEntityRecord;
      return {
        id: entity.id ?? null,
        entitiesId: entity.entitiesId ?? null,
        name: entity.name ?? null,
        type: entity.type ?? null,
        owner: normalizeOwner(entity.owner),
      };
    }

    const dependant = record as ClientDependantRecord;
    return {
      id: dependant.id ?? null,
      name: dependant.name ?? null,
      birthday: dependant.birthday ?? null,
      owner: normalizeOwner(dependant.owner),
    };
  }) as Array<IdentityRelationRecord<K>>;

  return {
    currentUser: null,
    request,
  };
}

function mergeEntityCollection(returnedRecords: ClientEntityRecord[], submittedRecords: ClientEntityRecord[]) {
  return returnedRecords.map((returnedRecord) => {
    const matched =
      submittedRecords.find((submittedRecord) => submittedRecord.id && returnedRecord.id && submittedRecord.id === returnedRecord.id) ??
      submittedRecords.find(
        (submittedRecord) =>
          (submittedRecord.name ?? "").trim().toLowerCase() === (returnedRecord.name ?? "").trim().toLowerCase() &&
          (submittedRecord.owner?.id ?? "") === (returnedRecord.owner?.id ?? ""),
      );

    return {
      ...returnedRecord,
      type: matched?.type ?? returnedRecord.type ?? null,
    };
  });
}

function mergeDependantCollection(returnedRecords: ClientDependantRecord[], submittedRecords: ClientDependantRecord[]) {
  return returnedRecords.map((returnedRecord) => {
    const matched =
      submittedRecords.find((submittedRecord) => submittedRecord.id && returnedRecord.id && submittedRecord.id === returnedRecord.id) ??
      submittedRecords.find(
        (submittedRecord) =>
          (submittedRecord.name ?? "").trim().toLowerCase() === (returnedRecord.name ?? "").trim().toLowerCase() &&
          (submittedRecord.birthday ?? "") === (returnedRecord.birthday ?? "") &&
          (submittedRecord.owner?.id ?? "") === (returnedRecord.owner?.id ?? ""),
      );

    return {
      ...returnedRecord,
      type: matched?.type ?? returnedRecord.type ?? "Child",
    };
  });
}

export function upsertEntityCollection(currentRecords: ClientEntityRecord[], nextRecord: ClientEntityRecord, editingId?: string | null) {
  return editingId
    ? currentRecords.map((record) => (record.id === editingId ? { ...record, ...nextRecord } : record))
    : [...currentRecords.map((record) => ({ ...record })), { id: null, entitiesId: null, ...nextRecord }];
}

export function upsertDependantCollection(currentRecords: ClientDependantRecord[], nextRecord: ClientDependantRecord, editingId?: string | null) {
  return editingId
    ? currentRecords.map((record) => (record.id === editingId ? { ...record, ...nextRecord } : record))
    : [...currentRecords.map((record) => ({ ...record })), { id: null, ...nextRecord }];
}

export async function saveEntityCollection(profileId: string, records: ClientEntityRecord[], context?: RequestContext) {
  const returnedRecords = await saveIdentityRelationCollection("entities", profileId, buildSavePayload("entities", records), context);
  return returnedRecords ? mergeEntityCollection(returnedRecords, records) : records;
}

export async function saveDependantCollection(profileId: string, records: ClientDependantRecord[], context?: RequestContext) {
  const returnedRecords = await saveIdentityRelationCollection("dependants", profileId, buildSavePayload("dependants", records), context);
  return returnedRecords ? mergeDependantCollection(returnedRecords, records) : records;
}

export async function deleteEntityCollectionItem(profileId: string, recordId: string, context?: RequestContext) {
  return deleteIdentityRelationItem("entities", profileId, recordId, context);
}

export async function deleteDependantCollectionItem(profileId: string, recordId: string, context?: RequestContext) {
  return deleteIdentityRelationItem("dependants", profileId, recordId, context);
}
