import { CheckIcon, MixerHorizontalIcon } from '@radix-ui/react-icons'
import type { Table } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { cn } from '../../utils/cn'
import { Button } from '../ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
  const [search, setSearch] = useState('')
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  const searchableColumns = useMemo(() => {
    return columns.map((column) => {
      const meta = column.columnDef.meta as { label?: string } | undefined
      const label = meta?.label ?? column.id
      return {
        column,
        label,
        labelLower: label.toLowerCase(),
      }
    })
  }, [columns])

  const visibleColumns = useMemo(
    () => searchableColumns.filter((item) => item.column.getIsVisible()),
    [searchableColumns],
  )

  const filteredColumns = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return visibleColumns
    return searchableColumns.filter((item) => item.labelLower.includes(term))
  }, [search, searchableColumns, visibleColumns])

  const MAX_RESULTS = 120
  const limitedColumns = filteredColumns.slice(0, MAX_RESULTS)
  const overflow = Math.max(filteredColumns.length - limitedColumns.length, 0)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto h-9">
          <MixerHorizontalIcon className="mr-2 h-4 w-4" />
          Colonnes
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher une colonne..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filteredColumns.length === 0 ? (
              <CommandEmpty>Aucune colonne.</CommandEmpty>
            ) : null}
            <CommandGroup>
              {!search && columns.length > visibleColumns.length ? (
                <CommandItem disabled>
                  Tapez pour chercher parmi {columns.length} colonnes.
                </CommandItem>
              ) : null}
              {limitedColumns.map((item) => {
                const isVisible = item.column.getIsVisible()
                return (
                  <CommandItem
                    key={item.column.id}
                    onSelect={() => item.column.toggleVisibility(!isVisible)}
                  >
                    <CheckIcon
                      className={cn(
                        'mr-2 h-4 w-4',
                        isVisible ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {overflow > 0 ? (
              <CommandItem disabled>+ {overflow} colonnes supplémentaires</CommandItem>
            ) : null}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => table.resetColumnVisibility()}
                className="justify-center text-center"
              >
                Tout afficher
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
