import { describe, expect, it } from 'vitest'

import { normalizeTrinoHttpBaseUrl } from './starburst.js'

describe('normalizeTrinoHttpBaseUrl', () => {
  it('accepts https Galaxy host', () => {
    expect(
      normalizeTrinoHttpBaseUrl(
        'https://philtraill-bustbankdemo.trino.galaxy.starburst.io',
      ),
    ).toBe('https://philtraill-bustbankdemo.trino.galaxy.starburst.io')
  })

  it('strips trailing slash and path', () => {
    expect(
      normalizeTrinoHttpBaseUrl(
        'https://cluster.example.com/foo/',
      ),
    ).toBe('https://cluster.example.com')
  })

  it('adds https when scheme omitted', () => {
    expect(normalizeTrinoHttpBaseUrl('cluster.trino.galaxy.starburst.io')).toBe(
      'https://cluster.trino.galaxy.starburst.io',
    )
  })

  it('parses JDBC URL from Galaxy Partner connect', () => {
    const jdbc =
      'jdbc:trino://philtraill-bustbankdemo.trino.galaxy.starburst.io:443?user=a@b.com/accountadmin'
    expect(normalizeTrinoHttpBaseUrl(jdbc)).toBe(
      'https://philtraill-bustbankdemo.trino.galaxy.starburst.io',
    )
  })

  it('parses JDBC with catalog/schema path', () => {
    expect(
      normalizeTrinoHttpBaseUrl(
        'jdbc:trino://host.example:8443/hive/default?SSL=true',
      ),
    ).toBe('https://host.example:8443')
  })
})
