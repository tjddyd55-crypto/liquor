import { useCallback, useEffect, useState } from 'react'
import { FormInput } from '../../../components/form'
import { Button } from '../../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { fetchTeamMembers } from '../api/teamApi'

type MenuKey = 'notice' | 'board' | 'image' | 'list'

const initialMenus: Record<MenuKey, boolean> = {
  notice: true,
  board: true,
  image: false,
  list: false,
}

export default function TeamMenuManagePage() {
  const { token, user } = useAuth()
  const [menus, setMenus] = useState(initialMenus)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setLoading(false)
      return
    }
    setLoadError('')
    try {
      const data = await fetchTeamMembers(token)
      setOwnerId(data.ownerId ?? null)
    } catch (e) {
      setOwnerId(null)
      setLoadError(e instanceof Error ? e.message : '정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (key: MenuKey) => {
    setMenus((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  if (loading) {
    return (
      <div className="content-wrapper page-shell">
        <p className="mt-4 text-sm text-[var(--text-secondary)]">불러오는 중…</p>
      </div>
    )
  }

  const isOwner = Boolean(ownerId && user?.id && ownerId === user.id)

  if (loadError || !isOwner) {
    return (
      <div className="content-wrapper page-shell">
        <h1 className="text-[var(--text-primary)] mt-3 text-lg font-semibold">팀 메뉴 관리</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]" role="status">
          {loadError ? loadError : '팀장만 이용할 수 있습니다.'}
        </p>
      </div>
    )
  }

  return (
    <div className="content-wrapper page-shell">
      <h1 className="text-[var(--text-primary)] mt-3 text-lg font-semibold">팀 메뉴 관리</h1>

      <div className="mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-soft)] p-4 space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          팀에서 사용할 메뉴를 선택하세요. (설명용 UI — 저장·연동은 이후 단계)
        </p>

        <div className="border-t border-[var(--border-default)] pt-3 space-y-3">
          <label className="flex items-start gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
            <FormInput
              type="checkbox"
              className="mt-1 shrink-0"
              checked={menus.notice}
              onChange={() => toggle('notice')}
            />
            <span>
              <span className="font-medium">공지 게시판</span>
              <span className="text-[var(--text-secondary)]"> (게시판형)</span>
              <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                글 본문 + 파일 첨부 · 상단 공지 정렬
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
            <FormInput
              type="checkbox"
              className="mt-1 shrink-0"
              checked={menus.board}
              onChange={() => toggle('board')}
            />
            <span>
              <span className="font-medium">자료실</span>
              <span className="text-[var(--text-secondary)]"> (파일 첨부형)</span>
              <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                게시글·팀 단위로 묶인 첨부 목록
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
            <FormInput
              type="checkbox"
              className="mt-1 shrink-0"
              checked={menus.image}
              onChange={() => toggle('image')}
            />
            <span>
              <span className="font-medium">이미지 게시판</span>
              <span className="text-[var(--text-secondary)]"> (카드형)</span>
              <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                카드 그리드 UI로 이미지 중심 노출
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
            <FormInput
              type="checkbox"
              className="mt-1 shrink-0"
              checked={menus.list}
              onChange={() => toggle('list')}
            />
            <span>
              <span className="font-medium">일반 리스트</span>
              <span className="text-[var(--text-secondary)]"> (단순형)</span>
              <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                제목·요약 위주의 단순 목록
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 border-t border-[var(--border-default)] pt-3">
          <div className="text-sm text-[var(--text-secondary)] mb-2">미리보기</div>
          <div className="text-sm text-[var(--text-primary)] space-y-1">
            {menus.notice ? <div>공지 게시판</div> : null}
            {menus.board ? <div>자료실</div> : null}
            {menus.image ? <div>이미지 게시판</div> : null}
            {menus.list ? <div>일반 리스트</div> : null}
            {!menus.notice && !menus.board && !menus.image && !menus.list ? (
              <div className="text-[var(--text-secondary)]">선택된 메뉴 없음</div>
            ) : null}
          </div>
        </div>

        <Button type="button" disabled className="mt-4 w-full">
          저장 (준비 중)
        </Button>
      </div>
    </div>
  )
}
