'use client'

import { useEffect } from 'react'

type TableState = {
  query: string
  page: number
}

type Controls = {
  root: HTMLDivElement
  filterInput: HTMLInputElement
  summary: HTMLParagraphElement
  pagination: HTMLDivElement
}

const PAGE_SIZE = 10

function isPlaceholderRow(row: HTMLTableRowElement) {
  return Array.from(row.cells).some((cell) => cell.hasAttribute('colspan'))
}

export function TableEnhancer() {
  useEffect(() => {
    const stateByTable = new WeakMap<HTMLTableElement, TableState>()
    const controlsByTable = new WeakMap<HTMLTableElement, Controls>()

    const createControls = (table: HTMLTableElement, id: string) => {
      const root = document.createElement('div')
      root.dataset.tableControls = id
      root.className = 'mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'

      const filterWrap = document.createElement('div')
      filterWrap.className = 'relative w-full md:max-w-sm'

      const filterInput = document.createElement('input')
      filterInput.type = 'text'
      filterInput.placeholder = 'Filter table records...'
      filterInput.className =
        'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
      filterInput.dataset.tableFilter = id
      filterWrap.appendChild(filterInput)

      const rightWrap = document.createElement('div')
      rightWrap.className = 'flex items-center justify-between gap-3 md:justify-end'

      const summary = document.createElement('p')
      summary.className = 'text-xs text-gray-500'
      summary.dataset.tableSummary = id

      const pagination = document.createElement('div')
      pagination.className = 'flex flex-wrap items-center gap-1'
      pagination.dataset.tablePagination = id

      rightWrap.append(summary, pagination)
      root.append(filterWrap, rightWrap)

      table.parentElement?.insertBefore(root, table)

      return { root, filterInput, summary, pagination }
    }

    const renderTable = (table: HTMLTableElement) => {
      const state = stateByTable.get(table)
      const controls = controlsByTable.get(table)
      if (!state || !controls) return

      const rows = Array.from(table.tBodies[0]?.rows ?? [])
      const placeholderRows = rows.filter(isPlaceholderRow)
      const dataRows = rows.filter((row) => !isPlaceholderRow(row))

      const normalizedQuery = state.query.trim().toLowerCase()
      const filteredRows = dataRows.filter((row) => row.textContent?.toLowerCase().includes(normalizedQuery))

      const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
      state.page = Math.min(state.page, totalPages)

      rows.forEach((row) => {
        row.style.display = 'none'
      })

      if (filteredRows.length === 0) {
        placeholderRows.forEach((row) => {
          row.style.display = ''
        })
      } else {
        const start = (state.page - 1) * PAGE_SIZE
        const end = start + PAGE_SIZE

        filteredRows.slice(start, end).forEach((row) => {
          row.style.display = ''
        })
      }

      if (filteredRows.length === 0) {
        controls.summary.textContent = normalizedQuery
          ? 'No matching records found.'
          : 'No records available.'
      } else {
        const start = (state.page - 1) * PAGE_SIZE
        const end = Math.min(start + PAGE_SIZE, filteredRows.length)
        controls.summary.textContent = `Showing ${start + 1}-${end} of ${filteredRows.length}`
      }

      controls.pagination.replaceChildren()
      if (filteredRows.length <= PAGE_SIZE) return

      for (let page = 1; page <= totalPages; page += 1) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = String(page)
        button.className =
          page === state.page
            ? 'h-8 min-w-8 rounded-md bg-blue-600 px-2 text-xs font-medium text-white'
            : 'h-8 min-w-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 hover:bg-gray-50'

        button.addEventListener('click', () => {
          state.page = page
          renderTable(table)
        })

        controls.pagination.appendChild(button)
      }
    }

    const enhanceTables = () => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('main table'))

      tables.forEach((table, index) => {
        if (!table.tBodies[0]) return

        if (!table.dataset.tableEnhancerId) {
          table.dataset.tableEnhancerId = `${Date.now()}-${index}`
        }

        const tableId = table.dataset.tableEnhancerId
        if (!tableId) return

        if (!stateByTable.has(table)) {
          stateByTable.set(table, { query: '', page: 1 })
        }

        let controls = controlsByTable.get(table)
        if (!controls) {
          controls = createControls(table, tableId)
          const createdControls = controls

          createdControls.filterInput.addEventListener('input', () => {
            const state = stateByTable.get(table)
            if (!state) return
            state.query = createdControls.filterInput.value
            state.page = 1
            renderTable(table)
          })

          controlsByTable.set(table, createdControls)
          controls = createdControls
        }

        controls.filterInput.value = stateByTable.get(table)?.query ?? ''
        renderTable(table)
      })
    }

    const main = document.querySelector('main')
    if (!main) return

    enhanceTables()

    const observer = new MutationObserver(() => {
      enhanceTables()
    })

    observer.observe(main, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  return null
}
