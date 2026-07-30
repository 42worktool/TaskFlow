<script setup lang="ts">
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { DashboardAPI } from '../api/dashboard'
import { realtime } from '../services/realtime'
import { parseWorkspaceChangedEvent } from '../services/realtime/protocol'
import type {
  DashboardActivityEventType,
  DashboardDailyFlow,
  DashboardPeriod,
  DashboardRecentActivity,
  DashboardTargetType,
  WorkspaceDashboard,
} from '../types'
import {
  buildContributionCells,
  contributionLevel,
  formatDashboardDate,
} from '../utils/dashboard'

const props = withDefaults(
  defineProps<{
    workspaceSyncVersion?: number
  }>(),
  {
    workspaceSyncVersion: 0,
  },
)

const route = useRoute()
const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
  { value: 365, label: '1년' },
]
const periodDays = ref<DashboardPeriod>(30)
const dashboard = ref<WorkspaceDashboard | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const heatmapScroll = ref<HTMLElement | null>(null)
let loadGeneration = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const workspaceId = computed(() => String(route.params.workspaceId ?? ''))
const contributionCells = computed(() =>
  buildContributionCells(dashboard.value?.daily_activity ?? []),
)
const contributionMaximum = computed(() =>
  Math.max(
    0,
    ...(dashboard.value?.daily_activity.map((day) => day.count) ?? []),
  ),
)
const contributionSummary = computed(() => {
  const days = dashboard.value?.daily_activity ?? []
  const total = days.reduce((sum, day) => sum + day.count, 0)
  const activeDays = days.filter((day) => day.count > 0).length
  return `최근 ${periodDays.value}일 활동 ${formatCount(total)}회, 활동이 기록된 날 ${formatCount(activeDays)}일`
})
const dateRange = computed(() => {
  const days = dashboard.value?.daily_activity ?? []
  const first = days[0]?.date
  const last = days.at(-1)?.date
  if (!first || !last) return ''
  return `${formatDashboardFullDate(first)} – ${formatDashboardFullDate(last)}`
})
const flowMaximum = computed(() =>
  Math.max(
    1,
    ...(dashboard.value?.daily_flow.flatMap((day) => [
      day.created,
      day.completed,
      day.reopened,
    ]) ?? []),
  ),
)
const breakdownMaximum = computed(() =>
  Math.max(
    1,
    ...(dashboard.value?.activity_breakdown.map((item) => item.count) ?? []),
  ),
)
const hasFlowActivity = computed(() =>
  Boolean(
    dashboard.value?.daily_flow.some(
      (day) => day.created + day.completed + day.reopened > 0,
    ),
  ),
)
const flowLabels = computed(() => {
  const days = dashboard.value?.daily_flow ?? []
  if (days.length === 0) return []
  return [days[0], days[Math.floor(days.length / 2)], days.at(-1)]
    .filter((day): day is DashboardDailyFlow => Boolean(day))
    .map((day) => formatDashboardDate(day.date))
})

const targetLabels: Record<DashboardTargetType, string> = {
  WORKSPACE: '워크스페이스',
  MEMBER: '팀원',
  LIST: '리스트',
  CARD: '카드',
  COMMENT: '댓글',
}

const activityLabels: Record<DashboardActivityEventType, string> = {
  WORKSPACE_UPDATED: '워크스페이스 설정을 변경했습니다.',
  WORKSPACE_DELETED: '워크스페이스를 삭제했습니다.',
  MEMBER_ADDED: '팀원을 추가했습니다.',
  MEMBER_REMOVED: '팀원을 내보냈습니다.',
  MEMBER_ROLE_CHANGED: '팀원 역할을 변경했습니다.',
  LIST_CREATED: '리스트를 만들었습니다.',
  LIST_UPDATED: '리스트를 변경했습니다.',
  LIST_MOVED: '리스트 순서를 변경했습니다.',
  LIST_DELETED: '리스트를 삭제했습니다.',
  CARD_CREATED: '카드를 만들었습니다.',
  CARD_UPDATED: '카드를 변경했습니다.',
  CARD_MOVED: '카드를 이동했습니다.',
  CARD_COMPLETED: '카드를 완료했습니다.',
  CARD_REOPENED: '완료한 카드를 다시 열었습니다.',
  CARD_DELETED: '카드를 삭제했습니다.',
  COMMENT_CREATED: '댓글을 남겼습니다.',
  COMMENT_UPDATED: '댓글을 수정했습니다.',
  COMMENT_DELETED: '댓글을 삭제했습니다.',
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatDashboardFullDate(value: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatActivityTimestamp(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function activityActorName(activity: DashboardRecentActivity): string {
  return activity.actor?.name ?? '알 수 없는 사용자'
}

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function flowPoints(
  key: 'created' | 'completed' | 'reopened',
): string {
  const days = dashboard.value?.daily_flow ?? []
  if (days.length === 0) return ''

  const left = 38
  const top = 18
  const width = 704
  const height = 170
  return days
    .map((day, index) => {
      const x =
        left + (index / Math.max(1, days.length - 1)) * width
      const y =
        top + height - (day[key] / flowMaximum.value) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function contributionLabel(
  date: string,
  count: number,
  logCount: number,
): string {
  return `${formatDashboardDate(date)}: 활동 ${formatCount(count)}회${
    logCount !== count ? ` · 로그 ${formatCount(logCount)}건` : ''
  }`
}

function showLatestContributionDays(): void {
  const element = heatmapScroll.value
  if (!element || element.scrollWidth <= element.clientWidth) return
  element.scrollLeft = element.scrollWidth - element.clientWidth
}

async function loadDashboard(background = false): Promise<void> {
  const id = workspaceId.value
  if (!id) return
  const requestedPeriod = periodDays.value
  const generation = ++loadGeneration
  if (background && dashboard.value) refreshing.value = true
  else {
    loading.value = true
    error.value = ''
  }

  try {
    const result = await DashboardAPI.get(id, requestedPeriod)
    if (
      generation !== loadGeneration ||
      id !== workspaceId.value ||
      requestedPeriod !== periodDays.value
    ) {
      return
    }
    const firstSnapshot = dashboard.value === null
    dashboard.value = result
    error.value = ''
    if (firstSnapshot) {
      await nextTick()
      showLatestContributionDays()
    }
  } catch (reason) {
    if (generation !== loadGeneration || id !== workspaceId.value) return
    const message =
      reason instanceof Error
        ? reason.message
        : '대시보드를 불러오지 못했습니다.'
    if (dashboard.value && background) {
      console.warn('[dashboard] background refresh failed', message)
    } else {
      error.value = message
    }
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadDashboard(true)
  }, 120)
}

const removeWorkspaceChangeListener = realtime.on(
  'workspace.changed',
  (value) => {
    const event = parseWorkspaceChangedEvent(value)
    if (!event || event.workspace_id !== workspaceId.value) return
    scheduleRefresh()
  },
)

watch(
  [workspaceId, periodDays],
  () => {
    dashboard.value = null
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    void loadDashboard()
  },
  { immediate: true },
)

watch(
  () => props.workspaceSyncVersion,
  (next, previous) => {
    if (next !== previous) scheduleRefresh()
  },
)

onUnmounted(() => {
  loadGeneration += 1
  if (refreshTimer) clearTimeout(refreshTimer)
  removeWorkspaceChangeListener()
})
</script>

<template>
  <main class="dashboard-page">
    <header class="dashboard-header">
      <div>
        <p class="dashboard-eyebrow">WORKSPACE ANALYTICS</p>
        <h1>활동 대시보드</h1>
        <p>
          활동 로그를 기준으로 이슈 흐름과 현재 진행 상태를 확인합니다.
        </p>
      </div>
      <div class="dashboard-header__actions">
        <label class="dashboard-period-picker">
          <span>기간</span>
          <select v-model.number="periodDays">
            <option
              v-for="option in PERIOD_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <span v-if="dashboard" class="dashboard-updated">
          {{ formatGeneratedAt(dashboard.generated_at) }} 갱신
        </span>
        <button
          type="button"
          class="dashboard-refresh"
          :disabled="loading || refreshing"
          @click="loadDashboard(true)"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M15.6 7.1A6 6 0 1 0 16 11" />
            <path d="M15.7 3.5v3.8h-3.8" />
          </svg>
          {{ refreshing ? '갱신 중' : '새로고침' }}
        </button>
      </div>
    </header>

    <section
      v-if="loading && !dashboard"
      class="dashboard-state"
      role="status"
    >
      <span class="dashboard-state__spinner" aria-hidden="true"></span>
      활동 데이터를 집계하는 중입니다.
    </section>

    <section
      v-else-if="error && !dashboard"
      class="dashboard-state dashboard-state--error"
      role="alert"
    >
      <strong>대시보드를 불러오지 못했습니다.</strong>
      <span>{{ error }}</span>
      <button type="button" @click="loadDashboard()">다시 시도</button>
    </section>

    <template v-else-if="dashboard">
      <section class="dashboard-kpis" aria-label="핵심 지표">
        <article class="dashboard-kpi dashboard-kpi--blue">
          <span>생성된 이슈</span>
          <strong>{{ formatCount(dashboard.summary.created_in_period) }}</strong>
          <small>최근 {{ dashboard.period_days }}일</small>
        </article>
        <article class="dashboard-kpi dashboard-kpi--green">
          <span>완료 처리</span>
          <strong>{{ formatCount(dashboard.summary.completed_in_period) }}</strong>
          <small>
            재오픈 {{ formatCount(dashboard.summary.reopened_in_period) }}회
          </small>
        </article>
        <article class="dashboard-kpi dashboard-kpi--amber">
          <span>현재 미완료</span>
          <strong>{{ formatCount(dashboard.summary.current_not_done) }}</strong>
          <small>완료 단계 밖의 카드</small>
        </article>
        <article class="dashboard-kpi dashboard-kpi--violet">
          <span>현재 완료</span>
          <strong>{{ formatCount(dashboard.summary.current_done) }}</strong>
          <small>완료 단계의 카드</small>
        </article>
        <article class="dashboard-kpi dashboard-kpi--teal">
          <span>완료율</span>
          <strong>
            {{
              dashboard.summary.has_cards
                ? `${dashboard.summary.completion_rate}%`
                : '—'
            }}
          </strong>
          <small>전체 {{ formatCount(dashboard.summary.current_total) }}개</small>
        </article>
        <article class="dashboard-kpi dashboard-kpi--slate">
          <span>워크스페이스 활동</span>
          <strong>{{ formatCount(dashboard.summary.activity_in_period) }}</strong>
          <small>최근 {{ dashboard.period_days }}일 동작</small>
        </article>
      </section>

      <section class="dashboard-panel dashboard-panel--heatmap">
        <div class="dashboard-panel__header">
          <div>
            <p class="dashboard-panel__eyebrow">CONTRIBUTIONS</p>
            <h2>선택 기간 활동</h2>
          </div>
          <div class="dashboard-panel__meta">
            <strong>{{ dateRange }}</strong>
            <span>한 칸은 하루, 한 동작은 한 번만 집계합니다.</span>
          </div>
        </div>

        <div ref="heatmapScroll" class="dashboard-heatmap-scroll">
          <div class="dashboard-heatmap-layout">
            <div class="dashboard-heatmap__day-labels" aria-hidden="true">
              <span></span>
              <span>월</span>
              <span></span>
              <span>수</span>
              <span></span>
              <span>금</span>
              <span></span>
            </div>
            <div
              class="dashboard-heatmap"
              role="img"
              :aria-label="contributionSummary"
            >
              <span
                v-for="cell in contributionCells"
                :key="cell.key"
                class="dashboard-heatmap__cell"
                :class="[
                  cell.placeholder
                    ? 'dashboard-heatmap__cell--placeholder'
                    : `dashboard-heatmap__cell--level-${contributionLevel(
                        cell.count,
                        contributionMaximum,
                      )}`,
                ]"
                aria-hidden="true"
                :title="
                  cell.date
                    ? contributionLabel(cell.date, cell.count, cell.logCount)
                    : undefined
                "
              ></span>
            </div>
          </div>
        </div>
        <div class="dashboard-heatmap__legend" aria-label="활동 강도 범례">
          <span>적음</span>
          <i
            v-for="level in [0, 1, 2, 3, 4]"
            :key="level"
            :class="`dashboard-heatmap__cell--level-${level}`"
          ></i>
          <span>많음</span>
        </div>
        <div class="dashboard-heatmap__dates" aria-hidden="true">
          <span>{{ formatDashboardFullDate(dashboard.daily_activity[0]?.date ?? '') }}</span>
          <span>
            {{
              formatDashboardFullDate(
                dashboard.daily_activity.at(-1)?.date ?? '',
              )
            }}
          </span>
        </div>
      </section>

      <div class="dashboard-grid">
        <section class="dashboard-panel dashboard-panel--flow">
          <div class="dashboard-panel__header">
            <div>
              <p class="dashboard-panel__eyebrow">ISSUE FLOW</p>
              <h2>최근 {{ dashboard.period_days }}일 이슈 흐름</h2>
            </div>
            <div class="dashboard-chart-legend" aria-label="차트 범례">
              <span class="dashboard-chart-legend__created">생성</span>
              <span class="dashboard-chart-legend__completed">완료</span>
              <span class="dashboard-chart-legend__reopened">재오픈</span>
            </div>
          </div>
          <figure class="dashboard-flow-chart">
            <svg
              viewBox="0 0 780 220"
              role="img"
              :aria-label="`최근 ${dashboard.period_days}일 카드 생성, 완료, 재오픈 추세`"
              preserveAspectRatio="none"
            >
              <g class="dashboard-flow-chart__grid">
                <line
                  v-for="index in [0, 1, 2, 3, 4]"
                  :key="index"
                  x1="38"
                  x2="742"
                  :y1="18 + index * 42.5"
                  :y2="18 + index * 42.5"
                />
              </g>
              <polyline
                class="dashboard-flow-chart__line dashboard-flow-chart__line--created"
                :points="flowPoints('created')"
              />
              <polyline
                class="dashboard-flow-chart__line dashboard-flow-chart__line--completed"
                :points="flowPoints('completed')"
              />
              <polyline
                class="dashboard-flow-chart__line dashboard-flow-chart__line--reopened"
                :points="flowPoints('reopened')"
              />
              <text x="6" y="23">{{ flowMaximum }}</text>
              <text x="24" y="192">0</text>
            </svg>
            <figcaption class="dashboard-flow-chart__labels">
              <span v-for="label in flowLabels" :key="label">{{ label }}</span>
            </figcaption>
            <p v-if="!hasFlowActivity" class="dashboard-chart-empty">
              이 기간에 생성·완료·재오픈 기록이 없습니다.
            </p>
          </figure>
        </section>

        <section class="dashboard-panel dashboard-panel--progress">
          <div class="dashboard-panel__header">
            <div>
              <p class="dashboard-panel__eyebrow">CURRENT STATE</p>
              <h2>현재 완료 상태</h2>
            </div>
          </div>
          <div class="dashboard-progress">
            <div
              class="dashboard-progress__donut"
              :style="{
                background: `conic-gradient(#16a34a 0 ${dashboard.summary.completion_rate}%, #e2e8f0 ${dashboard.summary.completion_rate}% 100%)`,
              }"
              role="img"
              :aria-label="
                dashboard.summary.has_cards
                  ? `현재 완료율 ${dashboard.summary.completion_rate}%`
                  : '현재 카드 없음'
              "
            >
              <div>
                <strong>
                  {{
                    dashboard.summary.has_cards
                      ? `${dashboard.summary.completion_rate}%`
                      : '—'
                  }}
                </strong>
                <span>완료율</span>
              </div>
            </div>
            <dl class="dashboard-progress__summary">
              <div>
                <dt>전체 카드</dt>
                <dd>{{ formatCount(dashboard.summary.current_total) }}</dd>
              </div>
              <div>
                <dt>미완료</dt>
                <dd>{{ formatCount(dashboard.summary.current_not_done) }}</dd>
              </div>
              <div>
                <dt>완료</dt>
                <dd>{{ formatCount(dashboard.summary.current_done) }}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div class="dashboard-grid dashboard-grid--bottom">
        <section class="dashboard-panel">
          <div class="dashboard-panel__header">
            <div>
              <p class="dashboard-panel__eyebrow">LIST DISTRIBUTION</p>
              <h2>리스트별 진행 현황</h2>
            </div>
          </div>
          <p v-if="dashboard.lists.length === 0" class="dashboard-empty">
            아직 리스트가 없습니다.
          </p>
          <ul v-else class="dashboard-bars">
            <li v-for="list in dashboard.lists" :key="list.list_id">
              <div class="dashboard-bars__label">
                <span>{{ list.name }}</span>
                <strong>
                  {{ formatCount(list.completed_card_count) }} /
                  {{ formatCount(list.card_count) }} 완료
                </strong>
              </div>
              <div class="dashboard-bars__track">
                <span
                  class="dashboard-bars__fill--done"
                  :style="{
                    width: `${
                      list.card_count
                        ? (list.completed_card_count / list.card_count) * 100
                        : 0
                    }%`,
                  }"
                ></span>
              </div>
            </li>
          </ul>
        </section>

        <section class="dashboard-panel">
          <div class="dashboard-panel__header">
            <div>
              <p class="dashboard-panel__eyebrow">ACTIVITY MIX</p>
              <h2>활동 구성</h2>
            </div>
            <p>최근 {{ dashboard.period_days }}일 로그 기준</p>
          </div>
          <ul class="dashboard-bars dashboard-bars--breakdown">
            <li
              v-for="item in dashboard.activity_breakdown"
              :key="item.target_type"
            >
              <div class="dashboard-bars__label">
                <span>{{ targetLabels[item.target_type] }}</span>
                <strong>{{ formatCount(item.count) }}</strong>
              </div>
              <div class="dashboard-bars__track">
                <span
                  :style="{
                    width: `${(item.count / breakdownMaximum) * 100}%`,
                  }"
                ></span>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section class="dashboard-panel dashboard-panel--activity-log">
        <div class="dashboard-panel__header">
          <div>
            <p class="dashboard-panel__eyebrow">ACTIVITY LOG</p>
            <h2>활동 내역</h2>
          </div>
          <div class="dashboard-panel__meta">
            <strong>{{ dateRange }}</strong>
            <span>최신 {{ dashboard.recent_activity.length }}건</span>
          </div>
        </div>
        <p
          v-if="dashboard.recent_activity.length === 0"
          class="dashboard-empty"
        >
          선택한 기간에 표시할 활동이 없습니다.
        </p>
        <ol v-else class="dashboard-activity-log">
          <li
            v-for="(activity, index) in dashboard.recent_activity"
            :key="`${activity.created_at}-${activity.event_type}-${activity.target_type}-${activity.target_id}-${index}`"
          >
            <span class="dashboard-activity-log__avatar" aria-hidden="true">
              <img
                v-if="activity.actor?.profile_image_url"
                :src="activity.actor.profile_image_url"
                alt=""
              />
              <span v-else>
                {{ activityActorName(activity).slice(0, 1) }}
              </span>
            </span>
            <div class="dashboard-activity-log__content">
              <p>
                <strong>{{ activityActorName(activity) }}</strong>
                {{ activityLabels[activity.event_type] }}
              </p>
              <span :title="activity.target_id">
                {{ targetLabels[activity.target_type] }}
                · {{ activity.target_id.slice(0, 8) }}
              </span>
            </div>
            <time :datetime="activity.created_at">
              {{ formatActivityTimestamp(activity.created_at) }}
            </time>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>

<style scoped src="../styles/dashboard.css"></style>
