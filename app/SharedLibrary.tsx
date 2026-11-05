'use client'
// Biblioteca compartida: la vista "shared" de LibraryBrowser (mismo diseño que Mi biblioteca).
// Solo lo publicado; el admin arma las carpetas, el profe navega y asigna.
import LibraryBrowser from './LibraryBrowser'

export { SHARED_TEXTS } from './LibraryBrowser'

export default function SharedLibrary({ onOpen, assignable, canManage = false }: {
  onOpen: (id: string) => void
  assignable?: boolean
  canManage?: boolean
}) {
  return <LibraryBrowser mode="shared" onOpen={onOpen} assignable={assignable} canManage={canManage} />
}
