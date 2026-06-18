<script setup lang="ts">
import type { User } from '../type'
import { mockBoardLists, mockBoards, mockCards } from '../mock'

const props = defineProps<{
  currentUser: User
}>()

const emit = defineEmits<{
  logout: []
}>()

const currentBoard = mockBoards[0]
const boardLists = mockBoardLists.filter((list) => list.boardId === currentBoard.id)

function getCardsByListId(listId: string) {
  return mockCards.filter(
    (card) => card.location.type === 'list' && card.location.listId === listId,
  )
}

const inboxCards = mockCards.filter(
  (card) => card.location.type === 'inbox' && card.location.userId === props.currentUser.id,
)
</script>

<template>
  <main class="app-layout">
    <aside class="inbox">
      <h2>Inbox</h2>

      <article v-for="card in inboxCards" :key="card.id" class="card">
        <strong>{{ card.title }}</strong>
        <p>{{ card.description }}</p>
      </article>
    </aside>

    <section class="board">
      <header class="board-header">
        <h1>{{ currentBoard.title }}</h1>
        <button type="button" class="logout-button" @click="emit('logout')">Logout</button>
      </header>

      <div class="board-lists">
        <section v-for="list in boardLists" :key="list.id" class="board-list">
          <h3>{{ list.title }}</h3>

          <article v-for="card in getCardsByListId(list.id)" :key="card.id" class="card">
            <strong>{{ card.title }}</strong>
            <p>{{ card.description }}</p>
          </article>
        </section>
      </div>
    </section>
  </main>
</template>
