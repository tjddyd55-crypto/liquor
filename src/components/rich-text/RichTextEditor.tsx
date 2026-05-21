import { useEffect, useRef } from 'react'
import { sanitizeRichTextHtml } from './richText'

type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const COLOR_OPTIONS = [
  { label: '검정', value: '#111827' },
  { label: '빨강', value: '#dc2626' },
  { label: '파랑', value: '#2563eb' },
  { label: '초록', value: '#059669' },
  { label: '노랑', value: '#d97706' },
]

const SIZE_OPTIONS = [
  { label: '작게', value: '0.9rem' },
  { label: '보통', value: '1rem' },
  { label: '크게', value: '1.25rem' },
  { label: '아주 크게', value: '1.5rem' },
]

function isSelectionInside(editor: HTMLElement, range: Range): boolean {
  const node = range.commonAncestorContainer
  return editor === node || editor.contains(node)
}

function applyInlineStyleToRange(range: Range, style: Record<string, string>) {
  const span = document.createElement('span')
  Object.entries(style).forEach(([property, value]) => {
    span.style.setProperty(property, value)
  })

  if (range.collapsed) {
    span.appendChild(document.createTextNode('\u200b'))
    range.insertNode(span)
    const nextRange = document.createRange()
    nextRange.setStart(span.firstChild ?? span, 1)
    nextRange.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(nextRange)
    return
  }

  try {
    range.surroundContents(span)
  } catch {
    const fragment = range.extractContents()
    span.appendChild(fragment)
    range.insertNode(span)
  }

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  nextRange.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(nextRange)
}

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '내용을 입력해 주세요.',
  disabled = false,
  className = '',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const lastHtmlRef = useRef('')
  const savedRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    const sanitized = sanitizeRichTextHtml(value)
    if (sanitized !== lastHtmlRef.current && editor.innerHTML !== sanitized) {
      editor.innerHTML = sanitized
      lastHtmlRef.current = sanitized
    }
  }, [value])

  const saveSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) {
      return
    }
    const range = selection.getRangeAt(0)
    if (isSelectionInside(editor, range)) {
      savedRangeRef.current = range.cloneRange()
    }
  }

  const restoreSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    const savedRange = savedRangeRef.current
    if (!editor || !selection || !savedRange || !isSelectionInside(editor, savedRange)) {
      return false
    }
    selection.removeAllRanges()
    selection.addRange(savedRange)
    return true
  }

  const emitChange = () => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    const sanitized = sanitizeRichTextHtml(editor.innerHTML)
    lastHtmlRef.current = sanitized
    onChange(sanitized)
    saveSelection()
  }

  const exec = (command: string, commandValue?: string) => {
    if (disabled) {
      return
    }
    const editor = editorRef.current
    if (!editor) {
      return
    }
    editor.focus()
    restoreSelection()
    runCommand(command, commandValue)
    emitChange()
  }

  const applyStyle = (style: Record<string, string>) => {
    if (disabled) {
      return
    }
    const editor = editorRef.current
    if (!editor) {
      return
    }
    editor.focus()
    restoreSelection()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }
    const range = selection.getRangeAt(0)
    if (!isSelectionInside(editor, range)) {
      return
    }
    applyInlineStyleToRange(range, style)
    emitChange()
  }

  const handlePlainTextPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    runCommand('insertText', text)
    emitChange()
  }

  return (
    <div className={`rich-text-editor ${className}`.trim()} data-disabled={disabled ? 'true' : 'false'}>
      <div className="rich-text-editor__toolbar" aria-label="글자 꾸미기 도구" onMouseDown={saveSelection}>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle({ 'font-weight': '700' })}
          disabled={disabled}
        >
          굵게
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle({ 'text-decoration': 'underline' })}
          disabled={disabled}
        >
          밑줄
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle({ color: '#dc2626', 'font-weight': '700' })}
          disabled={disabled}
        >
          빨강굵게
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle({ 'font-size': '1.25rem' })}
          disabled={disabled}
        >
          크게
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle({ 'font-size': '1rem' })}
          disabled={disabled}
        >
          보통
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => exec('insertUnorderedList')}
          disabled={disabled}
        >
          목록
        </button>
        <select
          aria-label="글자 색상"
          disabled={disabled}
          defaultValue=""
          onMouseDown={saveSelection}
          onChange={(event) => {
            if (event.target.value) {
              applyStyle({ color: event.target.value })
              event.target.value = ''
            }
          }}
        >
          <option value="">색상</option>
          {COLOR_OPTIONS.map((color) => (
            <option key={color.value} value={color.value}>{color.label}</option>
          ))}
        </select>
        <select
          aria-label="글자 크기"
          disabled={disabled}
          defaultValue=""
          onMouseDown={saveSelection}
          onChange={(event) => {
            if (event.target.value) {
              applyStyle({ 'font-size': event.target.value })
              event.target.value = ''
            }
          }}
        >
          <option value="">크기</option>
          {SIZE_OPTIONS.map((size) => (
            <option key={size.value} value={size.value}>{size.label}</option>
          ))}
        </select>
      </div>
      <div className="rich-text-editor__body-wrap">
        <div
          ref={editorRef}
          className="rich-text-editor__body"
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={saveSelection}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onPaste={handlePlainTextPaste}
        />
      </div>
    </div>
  )
}
