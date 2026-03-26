import type { TableDef } from '../lib/types'

export const DEMO_TABLES: TableDef[] = [
  {
    name: 'orders',
    columns: [
      { name: 'id', type: 'BIGINT', comment: 'PK' },
      { name: 'user_id', type: 'BIGINT', comment: 'FK users' },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'total_cents', type: 'INTEGER' },
    ],
  },
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'BIGINT', comment: 'PK' },
      { name: 'email', type: 'VARCHAR(255)' },
      { name: 'country', type: 'VARCHAR(64)' },
    ],
  },
]
