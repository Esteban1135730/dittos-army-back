# Actualiza stock (y novedad si el endpoint ya está desplegado) con overrides manuales.
$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:3000'

$manual = @{
  '317770' = @{ card_id = 'sv08.5-071'; card_name = 'Dreepy'; image_url = 'https://assets.tcgdex.net/en/sv/sv08.5/071/low.png' }
  '317742' = @{ card_id = 'sv08.5-036'; card_name = 'Dusclops'; image_url = 'https://assets.tcgdex.net/en/sv/sv08.5/036/low.png' }
  '317741' = @{ card_id = 'sv08.5-035'; card_name = 'Duskull'; image_url = 'https://assets.tcgdex.net/en/sv/sv08.5/035/low.png' }
  '318020' = @{ card_id = 'sv08.5-100'; card_name = 'Briar'; image_url = 'https://assets.tcgdex.net/en/sv/sv08.5/100/low.png' }
  '351325' = @{
    card_id = 'M2-083'
    card_name = 'Charcadet'
    image_url = 'https://www.cardtrader.com/uploads/blueprints/image/351325/show_charcadet-illustration-rare-083-080-inferno-x.jpg'
  }
  '329971' = @{
    card_id = 'CSV2C-132'
    card_name = 'Ralts'
    image_url = 'https://www.cardtrader.com/uploads/blueprints/image/329971/show_ralts-illustration-rare-132-128-miracle-journey.png'
  }
}

try {
  $bulk = Invoke-RestMethod -Uri "$Base/incoming/homolog/novedad-stock/apply-manual-tcgdex" -Method Post -TimeoutSec 120
  Write-Host "Endpoint apply-manual-tcgdex: actualizados $($bulk.updated_stock)"
  $bulk.items | ForEach-Object { Write-Host "  $($_.from_card_id) -> $($_.to_card_id) ($($_.card_name))" }
  exit 0
} catch {
  Write-Host "Endpoint no disponible (reinicia el back). Aplicando solo stock via API..."
}

$rows = Invoke-RestMethod -Uri "$Base/incoming/homolog/novedad-stock" -TimeoutSec 30 |
  Where-Object { $_.card_id -match '^ct-bp-' }

$updated = 0
foreach ($row in $rows) {
  $bp = [string]$row.blueprint_id
  if (-not $manual.ContainsKey($bp)) { continue }
  $m = $manual[$bp]
  $stockId = $row.stock_id
  if (-not $stockId) { continue }

  $stock = Invoke-RestMethod -Uri "$Base/stock/$stockId" -TimeoutSec 20
  $body = @{
    id = $stockId
    card_id = $m.card_id
    card_name = $m.card_name
    image_url = $m.image_url
    shipment = [double]$stock.shipment
    unity_cost = [double]$stock.unity_cost
    cards_in_shipmet = [int]$stock.cards_in_shipmet
    card_state = $stock.card_state
    language = $stock.language
    currency = $stock.currency
    incoming_notes = $stock.incoming_notes
    rareza = $stock.rareza
    tags = @($stock.tags)
  }
  Invoke-RestMethod -Uri "$Base/stock/update" -Method Post -Body ($body | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 30 | Out-Null
  Write-Host "OK stock $stockId $($row.card_name) -> $($m.card_id)"
  $updated++
}

Write-Host "Stock actualizado: $updated filas. Reinicia el back y ejecuta de nuevo para sincronizar novedad_stock."
