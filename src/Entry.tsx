import { lazy, Suspense } from 'react'
const App = lazy(() => new URLSearchParams(location.search).get('fixtures') === '1' ? import('./FixtureApp') : import('./App'))
export default function Entry(){return <Suspense fallback={<p>Opening Kin…</p>}><App/></Suspense>}
