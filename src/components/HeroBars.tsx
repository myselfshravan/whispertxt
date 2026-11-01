import { motion } from 'motion/react'
import { useMemo } from 'react'

const BAR_COUNT = 72

/** A speech-like envelope: fixed so the page looks the same on every visit. */
function barHeights(): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const phrase = Math.abs(Math.sin(i * 0.19) * Math.sin(i * 0.053 + 1))
    const syllable = (Math.sin(i * 1.7) + Math.sin(i * 2.9 + 0.7) + 2) / 4
    return 0.08 + 0.92 * phrase * (0.35 + 0.65 * syllable)
  })
}

export function HeroBars({ raised }: { raised: boolean }) {
  const heights = useMemo(barHeights, [])

  return (
    <div aria-hidden="true" className="flex h-[22vh] min-h-28 items-center gap-[0.35%]">
      {heights.map((height, i) => (
        <motion.span
          key={i}
          className="min-w-0 flex-1 rounded-full bg-marker"
          initial={{ scaleY: 0.02 }}
          animate={{ scaleY: raised ? Math.min(1, height * 1.6 + 0.2) : height }}
          style={{ height: '100%' }}
          transition={
            raised
              ? { type: 'spring', stiffness: 320, damping: 18 }
              : { duration: 0.7, delay: i * 0.008, ease: [0.2, 0.8, 0.2, 1] }
          }
        />
      ))}
    </div>
  )
}
