import type { SVGProps } from 'react'

/** 图标统一用内联 SVG（与原型一致，不引第三方图标库） */
type IconProps = SVGProps<SVGSVGElement>

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
} as const

export function CheckIcon(props: IconProps) {
  return (
    <svg
      {...BASE}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...BASE} width={18} height={18} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" {...props}>
      <circle cx={11} cy={11} r={7} />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...BASE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function PaperclipIcon(props: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.6 1.6 0 0 1-2.3-2.3l7.3-7.3" />
    </svg>
  )
}

export function SubtaskIcon(props: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...BASE} width={22} height={22} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...BASE} width={18} height={18} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...BASE} width={18} height={18} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function BoldIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} aria-hidden="true" {...props}>
      <text x={8} y={17} fontSize={15} fontWeight={700} fill="currentColor" stroke="none">
        B
      </text>
    </svg>
  )
}

export function ItalicIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} aria-hidden="true" {...props}>
      <text x={9} y={17} fontSize={15} fontStyle="italic" fill="currentColor" stroke="none">
        I
      </text>
    </svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.6-5.6l-1 1" />
      <path d="M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 5.6 5.6l1-1" />
    </svg>
  )
}

export function CodeIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx={4.5} cy={6} r={1.3} fill="currentColor" stroke="none" />
      <circle cx={4.5} cy={12} r={1.3} fill="currentColor" stroke="none" />
      <circle cx={4.5} cy={18} r={1.3} fill="currentColor" stroke="none" />
    </svg>
  )
}

export function QuoteIcon(props: IconProps) {
  return (
    <svg {...BASE} width={16} height={16} fill="currentColor" stroke="none" aria-hidden="true" {...props}>
      <path d="M7 6h4v7H8c0 2 .9 3 3 3v2c-3.7 0-6-2.3-6-6.2V6zm10 0h4v7h-3c0 2 .9 3 3 3v2c-3.7 0-6-2.3-6-6.2V6z" />
    </svg>
  )
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...BASE} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14 3v5h5" />
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2z" />
    </svg>
  )
}
