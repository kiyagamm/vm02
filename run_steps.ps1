try {
    # Step 1: POST /api/vendors
    Write-Output "=== Step 1 ==="
    $vendorBody = @{
        name = "Acme Supplies"
        email = "acme@test.com"
        phone = "555-1111"
        address = "123 Main St"
    } | ConvertTo-Json
    $vendorRes = Invoke-RestMethod -Uri "http://localhost:4000/api/vendors" -Method Post -Body $vendorBody -ContentType "application/json"
    $vendorRes | ConvertTo-Json | Write-Output
    $vendorId = $vendorRes.id
    if ($null -eq $vendorId) { $vendorId = $vendorRes.vendor.id }
    Write-Output "Captured Vendor ID: $vendorId"

    # Step 2: POST /api/customers
    Write-Output "=== Step 2 ==="
    $custBody = @{
        name = "Jane Doe"
        email = "jane@test.com"
        phone = "555-2222"
    } | ConvertTo-Json
    $custRes = Invoke-RestMethod -Uri "http://localhost:4000/api/customers" -Method Post -Body $custBody -ContentType "application/json"
    $custRes | ConvertTo-Json | Write-Output
    $customerId = $custRes.id
    if ($null -eq $customerId) { $customerId = $custRes.customer.id }
    Write-Output "Captured Customer ID: $customerId"

    # Step 3: GET /api/products
    Write-Output "=== Step 3 ==="
    $products = Invoke-RestMethod -Uri "http://localhost:4000/api/products" -Method Get
    # Product list might be wrapped or a direct array
    $prodList = $products
    if ($products.GetType().Name -eq "PSCustomObject" -and $products.products) {
        $prodList = $products.products
    }
    $firstProduct = $prodList[0]
    $firstProduct | ConvertTo-Json | Write-Output
    $prodId = $firstProduct.id
    $initialStock = $firstProduct.stock_quantity
    Write-Output "Captured Product ID: $prodId, Initial Stock: $initialStock"

    # Step 4: POST /api/purchase-orders
    Write-Output "=== Step 4 ==="
    $poBody = @{
        vendor_id = $vendorId
        notes = "test po"
        items = @(
            @{
                product_id = $prodId
                quantity = 5
                unit_cost = 10.5
            }
        )
    } | ConvertTo-Json -Depth 5
    $poRes = Invoke-RestMethod -Uri "http://localhost:4000/api/purchase-orders" -Method Post -Body $poBody -ContentType "application/json"
    $poRes | ConvertTo-Json | Write-Output
    $poId = $poRes.id
    if ($null -eq $poId) { $poId = $poRes.purchase_order.id }
    $poTotal = $poRes.total
    if ($null -eq $poTotal) { $poTotal = $poRes.purchase_order.total }
    Write-Output "Captured PO ID: $poId, Total: $poTotal"

    # Step 5: POST /api/purchase-orders/<po id>/receive
    Write-Output "=== Step 5 ==="
    $receiveRes = Invoke-RestMethod -Uri "http://localhost:4000/api/purchase-orders/$poId/receive" -Method Post -ContentType "application/json"
    $receiveRes | ConvertTo-Json | Write-Output

    # Step 6: GET /api/products/<first prod id>
    Write-Output "=== Step 6 ==="
    $updatedProduct = Invoke-RestMethod -Uri "http://localhost:4000/api/products/$prodId" -Method Get
    $updatedProduct | ConvertTo-Json | Write-Output
    $postPOStock = $updatedProduct.stock_quantity
    Write-Output "Product Stock after PO: $postPOStock"

    # Step 7: POST /api/sales-orders
    Write-Output "=== Step 7 ==="
    $soBody = @{
        customer_id = $customerId
        notes = "test so"
        items = @(
            @{
                product_id = $prodId
                quantity = 2
            }
        )
    } | ConvertTo-Json -Depth 5
    $soRes = Invoke-RestMethod -Uri "http://localhost:4000/api/sales-orders" -Method Post -Body $soBody -ContentType "application/json"
    $soRes | ConvertTo-Json | Write-Output
    $soId = $soRes.id
    if ($null -eq $soId) { $soId = $soRes.sales_order.id }
    Write-Output "Captured SO ID: $soId"

    # Step 8: POST /api/sales-orders/<so id>/confirm
    Write-Output "=== Step 8 ==="
    $confirmRes = Invoke-RestMethod -Uri "http://localhost:4000/api/sales-orders/$soId/confirm" -Method Post -ContentType "application/json"
    $confirmRes | ConvertTo-Json | Write-Output
    
    $updatedProd2 = Invoke-RestMethod -Uri "http://localhost:4000/api/products/$prodId" -Method Get
    $updatedProd2 | ConvertTo-Json | Write-Output
    $postConfirmStock = $updatedProd2.stock_quantity
    Write-Output "Product Stock after SO confirm: $postConfirmStock"

    # Step 9: POST /api/sales-orders/<so id>/mark-paid
    Write-Output "=== Step 9 ==="
    $paidRes = Invoke-RestMethod -Uri "http://localhost:4000/api/sales-orders/$soId/mark-paid" -Method Post -ContentType "application/json"
    $paidRes | ConvertTo-Json | Write-Output

    # Step 10: GET /api/sales
    Write-Output "=== Step 10 ==="
    $sales = Invoke-RestMethod -Uri "http://localhost:4000/api/sales" -Method Get
    $sales | ConvertTo-Json | Write-Output

    # Step 11: POST /api/stock-adjustments
    Write-Output "=== Step 11 ==="
    $adjBody = @{
        product_id = $prodId
        quantity_change = -1
        reason = "damaged unit"
    } | ConvertTo-Json
    $adjRes = Invoke-RestMethod -Uri "http://localhost:4000/api/stock-adjustments" -Method Post -Body $adjBody -ContentType "application/json"
    $adjRes | ConvertTo-Json | Write-Output

    $updatedProd3 = Invoke-RestMethod -Uri "http://localhost:4000/api/products/$prodId" -Method Get
    $postAdjStock = $updatedProd3.stock_quantity
    Write-Output "Product Stock after Adj: $postAdjStock"

    # Step 12: GET /api/stock-adjustments
    Write-Output "=== Step 12 ==="
    $adjustments = Invoke-RestMethod -Uri "http://localhost:4000/api/stock-adjustments" -Method Get
    $adjustments | ConvertTo-Json | Write-Output

    # Step 13: Clean up (DELETE vendor/customer)
    Write-Output "=== Step 13 ==="
    $delVendor = Invoke-RestMethod -Uri "http://localhost:4000/api/vendors/$vendorId" -Method Delete
    $delVendor | ConvertTo-Json | Write-Output
    $delCust = Invoke-RestMethod -Uri "http://localhost:4000/api/customers/$customerId" -Method Delete
    $delCust | ConvertTo-Json | Write-Output

} catch {
    Write-Error $_
}
