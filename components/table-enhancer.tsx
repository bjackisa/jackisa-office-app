'use client'

import { useEffect } from 'react'

type TableState = {
  query: string
  page: number
}

const PAGE_SIZE = 10

export function TableEnhancer() {
  useEffect(() => {
    const stateByTable = new WeakMap<HTMLTableElement, TableState>()

    const enhanceTables = () => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('main table'))

      tables.forEach((table, index) => {
        const tbody = table.tBodies[0]
        if (!tbody) return

        if (!table.dataset.tableEnhancerId) {
          table.dataset.tableEnhancerId = `${Date.now()}-${index}`
        }

        const enhancerId = table.dataset.tableEnhancerId
        if (!enhancerId) return

        let controls = table.parentElement?.querySelector<HTMLDivElement>(`[data-table-controls="${enhancerId}"]`)

        if (!controls) {
          controls = document.createElement('div')
          controls.dataset.tableControls = enhancerId
          controls.className = 'mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'
          controls.innerHTML = `
            <div class="relative w-full md:max-w-sm">
              <input
                type="text"
                placeholder="Filter table records..."
                class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                data-table-filter="${enhancerId}"
              />
            </div>
            <div class="flex items-center justify-between gap-3 md:justify-end">
              <p class="text-xs text-gray-500" data-table-summary="${enhancerId}"></p>
              <div class="flex flex-wrap items-center gap-1" data-table-pagination="${enhancerId}"></div>
            </div>
          `
          table.parentElement?.insertBefore(controls, table)
        }

        const filterInput = controls.querySelector<HTMLInputElement>(`[data-table-filter="${enhancerId}"]`)
        const summary = controls.querySelector<HTMLParagraphElement>(`[data-table-summary="${enhancerId}"]`)
        const pagination = controls.querySelector<HTMLDivElement>(`[data-table-pagination="${enhancerId}"]`)
        if (!filterInput || !summary || !pagination) return

        const existingState = stateByTable.get(table)
        if (!existingState) {
          stateByTable.set(table, { query: '', page: 1 })
          filterInput.addEventListener('input', () => {
            const state = stateByTable.get(table)
            if (!state) return
            state.query = filterInput.value.toLowerCase()
            state.page = 1
            renderTable(table, state, summary, pagination)
          })
        }

        const state = stateByTable.get(table)
        if (!state) return

        filterInput.value = state.query
        renderTable(table, state, summary, pagination)
      })
    }

    const renderTable = (
      table: HTMLTableElement,
      state: TableState,
      summary: HTMLParagraphElement,
      pagination: HTMLDivElement,
    ) => {
      const rows = Array.from(table.tBodies[0]?.rows || [])
      const filteredRows = rows.filter((row) => row.innerText.toLowerCase().includes(state.query))

      const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
      state.page = Math.min(state.page, totalPages)

      rows.forEach((row) => {
        row.style.display = 'none'
      })

      const start = (state.page - 1) * PAGE_SIZE
      const end = start + PAGE_SIZE
      filteredRows.slice(start, end).forEach((row) => {
        row.style.display = ''
      })

      if (filteredRows.length === 0) {
        summary.textContent = 'No matching records found.'
      } else {
        summary.textContent = `Showing ${start + 1}-${Math.min(end, filteredRows.length)} of ${filteredRows.length}`
      }

      pagination.innerHTML = ''

      for (let page = 1; page <= totalPages; page += 1) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = String(page)
        button.className = page === state.page
          ? 'h-8 min-w-8 rounded-md bg-blue-600 px-2 text-xs font-medium text-white'
          : 'h-8 min-w-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 hover:bg-gray-50'
        button.addEventListener('click', () => {
          state.page = page
          renderTable(table, state, summary, pagination)
        })
        pagination.appendChild(button)
      }
    }

    enhanceTables()

    const observer = new MutationObserver(() => {
      enhanceTables()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
