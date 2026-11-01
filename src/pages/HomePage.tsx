import { useRef } from 'react'
import { Header } from '../components/Header'
import { HeroBars } from '../components/HeroBars'
import { useApp } from '../components/Layout'
import { Library } from '../components/Library'
import { Options } from '../components/Options'

export function HomePage() {
  const { addFiles, isDragging } = useApp()
  const picker = useRef<HTMLInputElement>(null)

  return (
    <>
      <div className="bg-cobalt px-5 pt-5 pb-8 text-white sm:px-10">
        <Header />
        <main className="pt-14 sm:pt-20">
          <h1 className="max-w-[13ch] font-extrabold text-[clamp(3.25rem,10.5vw,8.5rem)] leading-[0.92] tracking-[-0.035em]">
            Turn any audio or video into text.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed sm:text-xl">
            Free and open source. Your file goes straight from this browser to Groq on your own API
            key, with no server in between.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="rounded-full bg-marker px-8 py-4 font-bold text-[#0d1240] text-xl transition-transform hover:-rotate-1 active:scale-95"
            >
              Choose a file
            </button>
            <span>or drop one anywhere. Long files are fine.</span>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept="audio/*,video/*,.mkv,.avi,.wmv,.flv,.opus,.m4a"
              aria-label="Choose audio or video files"
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
          </div>
          <Options />
        </main>
        <div className="mt-8">
          <HeroBars raised={isDragging} />
        </div>
      </div>
      <Library />
    </>
  )
}
