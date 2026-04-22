import type { ClientDependantRecord, ClientEntityRecord } from "@/lib/api/types";

export type IdentityRelationKind = "entities" | "dependants";

export type IdentityRelationRecordMap = {
  entities: ClientEntityRecord;
  dependants: ClientDependantRecord;
};

export type IdentityRelationRecord<K extends IdentityRelationKind> = IdentityRelationRecordMap[K];

export type IdentityRelationSavePayload<K extends IdentityRelationKind> = {
  currentUser: null;
  request: Array<IdentityRelationRecord<K>>;
};
