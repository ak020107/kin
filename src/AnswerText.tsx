const guide='https://www.niddk.nih.gov/health-information/diagnostic-tests/A1C-test'
const footer=`General health information: ${guide}`
export function AnswerText({text}:{text:string}){
 const education=text.endsWith(footer)
 return <><p>{education?text.slice(0,-footer.length).trimEnd():text}</p>{education&&<a className="health-guide" href={guide} target="_blank" rel="noopener noreferrer">About this test · NIDDK ↗</a>}</>
}
