import type { Table } from '@tanstack/react-table'
import { startTransition, useEffect, useState } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { DataTableFacetedFilter } from './data-table-faceted-filter'
import { DataTableViewOptions } from './data-table-view-options'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

type FacetFilter = {
  columnId: string
  title: string
  options: { label: string; value: string }[]
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  filters?: FacetFilter[]
  globalPlaceholder?: string
  showViewOptions?: boolean
}

export function DataTableToolbar<TData>({
  table,
  filters = [],
  globalPlaceholder = 'Rechercher...',
  showViewOptions = true,
}: DataTableToolbarProps<TData>) {
  const [searchValue, setSearchValue] = useState(
    (table.getState().globalFilter as string) ?? '',
  )
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        table.setGlobalFilter(searchValue)
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [searchValue, table])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder={globalPlaceholder}
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        className="h-9 w-full max-w-sm"
      />
      {filters.map((filter) => {
        const column = table.getColumn(filter.columnId)
        if (!column) return null
        return (
          <DataTableFacetedFilter
            key={filter.columnId}
            column={column}
            title={filter.title}
            options={filter.options}
          />
        )
      })}
      {isFiltered ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter('')
            setSearchValue('')
          }}
        >
          Réinitialiser
          <Cross2Icon className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
      {showViewOptions ? <DataTableViewOptions table={table} /> : null}
    </div>
  )
}
