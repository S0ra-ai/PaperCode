import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspaceStore } from '@/features/workspace/stores/workspace'

// Mock the API modules
vi.mock('@/features/workspace/api/session', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessions: vi.fn(),
  getSessionWorkspace: vi.fn(),
  getSessionAttachments: vi.fn(),
  uploadSessionAttachment: vi.fn()
}))

vi.mock('@/features/workspace/api/task', () => ({
  submitGenerateTask: vi.fn(),
  getTaskStatus: vi.fn()
}))

import { getSessions, createSession, deleteSession } from '@/features/workspace/api/session'

describe('workspace store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useWorkspaceStore()
  })

  // ── Initial state ──
  describe('initial state', () => {
    it('starts with empty sessions', () => {
      expect(store.sessions).toEqual([])
    })

    it('starts with no selected session', () => {
      expect(store.selectedSessionId).toBe('')
    })

    it('has all loading flags set to false', () => {
      expect(store.loading.bootstrap).toBe(false)
      expect(store.loading.session).toBe(false)
      expect(store.loading.upload).toBe(false)
      expect(store.loading.task).toBe(false)
    })

    it('workspaceStateReady is false initially', () => {
      expect(store.workspaceStateReady).toBe(false)
    })
  })

  // ── Computed ──
  describe('computed properties', () => {
    it('currentSession returns null when no session is selected', () => {
      expect(store.currentSession).toBeNull()
    })

    it('currentSession returns the matching session', () => {
      store.sessions = [
        { sessionId: 'a', name: 'A' },
        { sessionId: 'b', name: 'B' }
      ]
      store.selectedSessionId = 'b'
      expect(store.currentSession).toEqual({ sessionId: 'b', name: 'B' })
    })

    it('currentTaskSnapshots returns empty array when no snapshots exist', () => {
      store.selectedSessionId = 'x'
      expect(store.currentTaskSnapshots).toEqual([])
    })

    it('currentTaskSnapshots returns snapshots for selected session', () => {
      store.selectedSessionId = 's1'
      store.taskSnapshotsBySessionId = { s1: [{ id: 't1' }] }
      expect(store.currentTaskSnapshots).toEqual([{ id: 't1' }])
    })

    it('currentTaskId returns empty string by default', () => {
      store.selectedSessionId = 'x'
      expect(store.currentTaskId).toBe('')
    })

    it('currentTaskForm returns default form when none set', () => {
      store.selectedSessionId = 'x'
      expect(store.currentTaskForm).toEqual({ userInput: '', outline: '' })
    })

    it('currentSelectedFileIds returns empty array by default', () => {
      store.selectedSessionId = 'x'
      expect(store.currentSelectedFileIds).toEqual([])
    })
  })

  // ── Actions ──
  describe('fetchSessions', () => {
    it('populates sessions on success', async () => {
      const mockSessions = [{ sessionId: '1' }, { sessionId: '2' }]
      getSessions.mockResolvedValue({ data: { code: 200, data: mockSessions } })

      await store.fetchSessions()

      expect(store.sessions).toEqual(mockSessions)
      expect(store.loading.session).toBe(false)
    })

    it('keeps sessions empty when API returns non-200', async () => {
      getSessions.mockResolvedValue({ data: { code: 500, data: [] } })

      await store.fetchSessions()

      expect(store.sessions).toEqual([])
    })

    it('resets loading flag even on error', async () => {
      getSessions.mockRejectedValue(new Error('network'))

      await store.fetchSessions().catch(() => {})

      expect(store.loading.session).toBe(false)
    })
  })

  describe('addSession', () => {
    it('creates session and selects it', async () => {
      createSession.mockResolvedValue({
        data: { code: 200, data: { sessionId: 'new-1' } }
      })
      getSessions.mockResolvedValue({
        data: { code: 200, data: [{ sessionId: 'new-1' }] }
      })

      const id = await store.addSession()

      expect(id).toBe('new-1')
      expect(store.selectedSessionId).toBe('new-1')
      expect(store.loading.session).toBe(false)
    })

    it('returns null on API failure', async () => {
      createSession.mockResolvedValue({ data: { code: 500 } })

      const id = await store.addSession()

      expect(id).toBeNull()
    })
  })

  describe('removeSession', () => {
    it('removes session and reselects first available', async () => {
      store.sessions = [{ sessionId: 'a' }, { sessionId: 'b' }]
      store.selectedSessionId = 'a'

      deleteSession.mockResolvedValue({ data: { code: 200 } })
      getSessions.mockResolvedValue({
        data: { code: 200, data: [{ sessionId: 'b' }] }
      })

      await store.removeSession('a')

      expect(store.sessions).toEqual([{ sessionId: 'b' }])
      expect(store.selectedSessionId).toBe('b')
    })

    it('clears selectedSessionId when no sessions remain', async () => {
      store.sessions = [{ sessionId: 'a' }]
      store.selectedSessionId = 'a'

      deleteSession.mockResolvedValue({ data: { code: 200 } })
      getSessions.mockResolvedValue({ data: { code: 200, data: [] } })

      await store.removeSession('a')

      expect(store.selectedSessionId).toBe('')
    })
  })

  describe('selectSession', () => {
    it('updates selectedSessionId', () => {
      store.workspaceStateReady = true
      store.selectSession('abc')
      expect(store.selectedSessionId).toBe('abc')
    })
  })

  // ── Setters ──
  describe('state setters', () => {
    it('updateTaskForm stores the form for a session', () => {
      store.workspaceStateReady = true
      store.updateTaskForm('s1', { userInput: 'hello', outline: 'world' })
      expect(store.taskFormsBySessionId).toEqual({
        s1: { userInput: 'hello', outline: 'world' }
      })
    })

    it('updateTaskForm defaults missing fields', () => {
      store.workspaceStateReady = true
      store.updateTaskForm('s1', {})
      expect(store.taskFormsBySessionId.s1).toEqual({ userInput: '', outline: '' })
    })

    it('setCurrentTaskId stores taskId for session', () => {
      store.setCurrentTaskId('s1', 'task-42')
      expect(store.currentTaskIdBySessionId.s1).toBe('task-42')
    })

    it('setTaskSnapshots stores snapshots for session', () => {
      const snaps = [{ id: 1 }, { id: 2 }]
      store.setTaskSnapshots('s1', snaps)
      expect(store.taskSnapshotsBySessionId.s1).toEqual(snaps)
    })

    it('setSelectedFileIds stores file ids for session', () => {
      store.setSelectedFileIds('s1', ['f1', 'f2'])
      expect(store.selectedFileIdsBySessionId.s1).toEqual(['f1', 'f2'])
    })

    it('setTaskCode stores code for session', () => {
      store.setTaskCode('s1', 'console.log("hi")')
      expect(store.taskCodesBySessionId.s1).toBe('console.log("hi")')
    })
  })

  // ── pruneOrphanedState ──
  describe('pruneOrphanedState', () => {
    it('removes state entries for sessions that no longer exist', () => {
      store.sessions = [{ sessionId: 'keep' }]
      store.taskSnapshotsBySessionId = { keep: [1], gone: [2] }
      store.currentTaskIdBySessionId = { keep: 't1', gone: 't2' }
      store.taskCodesBySessionId = { gone: 'code' }
      store.taskFormsBySessionId = { gone: { userInput: 'x', outline: '' } }
      store.selectedFileIdsBySessionId = { gone: ['f1'] }

      store.pruneOrphanedState()

      expect(store.taskSnapshotsBySessionId).toEqual({ keep: [1] })
      expect(store.currentTaskIdBySessionId).toEqual({ keep: 't1' })
      expect(store.taskCodesBySessionId).toEqual({})
      expect(store.taskFormsBySessionId).toEqual({})
      expect(store.selectedFileIdsBySessionId).toEqual({})
    })

    it('reselects first session if selected session was pruned', () => {
      store.sessions = [{ sessionId: 'a' }]
      store.selectedSessionId = 'removed'

      store.pruneOrphanedState()

      expect(store.selectedSessionId).toBe('a')
    })
  })

  // ── $reset ──
  describe('$reset', () => {
    it('resets all state to defaults', () => {
      store.sessions = [{ sessionId: 'x' }]
      store.selectedSessionId = 'x'
      store.taskSnapshotsBySessionId = { x: [1] }
      store.workspaceStateReady = true

      store.$reset()

      expect(store.sessions).toEqual([])
      expect(store.selectedSessionId).toBe('')
      expect(store.taskSnapshotsBySessionId).toEqual({})
      expect(store.workspaceStateReady).toBe(false)
    })
  })

  // ── restoreWorkspaceState ──
  describe('restoreWorkspaceState', () => {
    it('does nothing when userId is falsy', () => {
      store.restoreWorkspaceState('')
      expect(store.workspaceStateReady).toBe(false)
    })

    it('restores state from localStorage', () => {
      const saved = {
        selectedSessionId: 'restored',
        taskFormsBySessionId: { restored: { userInput: 'hi', outline: '' } }
      }
      localStorage.setItem('workspaceState:user1', JSON.stringify(saved))

      store.restoreWorkspaceState('user1')

      expect(store.selectedSessionId).toBe('restored')
      expect(store.taskFormsBySessionId).toEqual(saved.taskFormsBySessionId)
      expect(store.workspaceStateReady).toBe(true)

      localStorage.removeItem('workspaceState:user1')
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('workspaceState:user1', 'not-json')

      store.restoreWorkspaceState('user1')

      expect(store.workspaceStateReady).toBe(true)
      expect(store.selectedSessionId).toBe('')

      localStorage.removeItem('workspaceState:user1')
    })
  })
})
