import { useRef, useState } from 'react'
import { fileMatches } from './comfort'

/**
 * Makes an element a place to drop files on: spread `dropProps` on it and style it with `dragging`.
 * `onFiles` gets the dropped files that fit `accept`; `onReject` gets a sentence when none did, so
 * a PDF dropped on a GPX field is answered instead of ignored.
 */
export default function useFileDrop({ accept, onFiles, onReject, disabled = false }) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0) // dragenter/dragleave fire for every child element
  const hasFiles = (event) => event.dataTransfer?.types?.includes('Files')

  const dropProps = {
    onDragEnter: (event) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setDragging(true)
    },
    onDragOver: (event) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      depth.current = 0
      setDragging(false)
      if (disabled) return
      const dropped = [...event.dataTransfer.files]
      const fitting = dropped.filter((file) => fileMatches(file, accept))
      if (fitting.length) onFiles(fitting)
      else if (dropped.length) onReject?.(`“${dropped[0].name}” is not a file this field takes (${accept.split(',').filter((part) => part.trim().startsWith('.')).join(', ')}).`)
    },
  }
  return { dragging, dropProps }
}
