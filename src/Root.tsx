import { Suspense, lazy, useEffect, useState } from 'react'
import App from './App.tsx'

// The story is its own page at #story. It loads only when asked for.
const Story = lazy(() => import('./story/Story.tsx'))
const isStory = () => location.hash === '#story'

export default function Root() {
  const [story, setStory] = useState(isStory)
  useEffect(() => {
    const onHash = () => setStory(isStory())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return story ? (
    <Suspense fallback={<div className="splash"><p>Loading the story…</p></div>}>
      <Story />
    </Suspense>
  ) : (
    <App />
  )
}
