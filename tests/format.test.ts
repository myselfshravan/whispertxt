import { describe, expect, it } from 'vitest'
import { clock, humanDuration, render, subtitleTime, toSrt, toVtt } from '../src/lib/format'
import type { Transcript } from '../src/lib/types'

const segments = [
  { text: ' Hello ', start: 0, end: 1.5 },
  { text: '   ', start: 1.5, end: 2 },
  { text: 'world', start: 3661.25, end: 3662 },
]

describe('subtitleTime', () => {
  it('uses the right separator', () => {
    expect(subtitleTime(1.5, ',')).toBe('00:00:01,500')
    expect(subtitleTime(1.5, '.')).toBe('00:00:01.500')
  })

  it('carries rounding into the next second', () => {
    expect(subtitleTime(1.9996, ',')).toBe('00:00:02,000')
    expect(subtitleTime(59.9999, '.')).toBe('00:01:00.000')
  })

  it('handles hours and negatives', () => {
    expect(subtitleTime(3661.25, ',')).toBe('01:01:01,250')
    expect(subtitleTime(-1, ',')).toBe('00:00:00,000')
  })
})

describe('subtitles', () => {
  it('numbers SRT cues without gaps when empty cues are dropped', () => {
    expect(toSrt(segments)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n01:01:01,250 --> 01:01:02,000\nworld\n',
    )
  })

  it('writes a VTT header', () => {
    expect(toVtt(segments)).toMatch(/^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.500\nHello\n/)
  })
})

it('renders JSON with the fields people need', () => {
  const transcript = {
    name: 'a.mp3',
    duration: 3,
    model: 'm',
    detectedLanguage: 'English',
    text: 'Hello',
    segments: [],
    words: [],
  } as unknown as Transcript
  expect(JSON.parse(render(transcript, 'json'))).toMatchObject({
    name: 'a.mp3',
    language: 'English',
  })
})

it('formats durations for people', () => {
  expect(clock(65)).toBe('1:05')
  expect(clock(3725)).toBe('1:02:05')
  expect(humanDuration(42)).toBe('42 sec')
  expect(humanDuration(3060)).toBe('51 min')
  expect(humanDuration(3900)).toBe('1 hr 5 min')
  expect(humanDuration(7200)).toBe('2 hr')
})
