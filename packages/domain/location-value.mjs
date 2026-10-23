// Kept independent of the store so the readonly query and mutation layer share semantics.
export function locationValue(photo,row){
  const suggestion=row?.suggestion||null,manual=row?.manual||null;
  const value=manual||suggestion;
  return {city:value?.city||'',site:value?.site||'',status:manual?(manual.city||manual.site?'confirmed':'unknown'):suggestion?.city||suggestion?.site?'suggested':'unknown',
    reason:value?.reason||'',confidence:manual?'user':suggestion?.confidence||'unknown',
    stale:!manual&&!!suggestion&&(suggestion.sourceHash!==photo.hash||suggestion.previewHash!==photo.previewHash),
    suggestion,manual,version:row?.version||0,updatedAt:row?.updatedAt||null};
}
