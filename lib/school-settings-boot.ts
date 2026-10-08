/** Staff and school settings are protected resources; fetch them only after membership exists. */
export async function loadSchoolSettings<T extends {id:string},H,S>(
  fetchSchool:()=>Promise<T|null>,fetchHeads:()=>Promise<H>,fetchStaff:()=>Promise<S[]>,
) {
  const data=await fetchSchool()
  if (!data?.id) return {data:null,heads:null,staff:[] as S[]}
  const [heads,staff]=await Promise.all([fetchHeads(),fetchStaff()])
  return {data,heads,staff}
}
