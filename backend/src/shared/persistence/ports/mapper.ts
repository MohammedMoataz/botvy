/**
 * Between an aggregate and its stored shape. `toDomain` upcasts by
 * `schemaVersion`, which is why a document written by an older build can still
 * be read: migrations only go forward, and a document that has not been
 * rewritten yet is upcast on read rather than left unreadable.
 */
export interface Mapper<T, Doc> {
  toDomain(doc: Doc): T;
  toPersistence(aggregate: T): Doc;
}
