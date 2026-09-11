import json
import os
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public_inventory"
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products.json"
SALES_FILE = DATA_DIR / "sales.json"
EXPENSES_FILE = DATA_DIR / "expenses.json"
VENDORS_FILE = DATA_DIR / "vendors.json"
CUSTOMERS_FILE = DATA_DIR / "customers.json"
PURCHASE_ORDERS_FILE = DATA_DIR / "purchase_orders.json"
STOCK_ADJUSTMENTS_FILE = DATA_DIR / "stock_adjustments.json"
PORT = int(os.environ.get("PORT", "4000"))


def ensure_data_files():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PRODUCTS_FILE.exists():
        initial_products = [
            {
                "id": 1,
                "name": "Logitech MX Anywhere 3",
                "sku": "ACC-1001",
                "category": "Mouse",
                "stock_quantity": 12,
                "price": 79.99,
                "purchase_price": 54.50,
                "reorder_level": 5,
                "supplier": "Tech Supplies Ltd.",
            },
            {
                "id": 2,
                "name": "Dell UltraSharp 27",
                "sku": "ACC-1002",
                "category": "Monitor",
                "stock_quantity": 3,
                "price": 329.99,
                "purchase_price": 240.00,
                "reorder_level": 4,
                "supplier": "Vision Systems",
            },
            {
                "id": 3,
                "name": "Anker 735 Charger",
                "sku": "ACC-1003",
                "category": "Charging",
                "stock_quantity": 18,
                "price": 109.99,
                "purchase_price": 72.00,
                "reorder_level": 6,
                "supplier": "PowerPoint Co.",
            },
            {
                "id": 4,
                "name": "JBL Noise Cancelling Headset",
                "sku": "ACC-1004",
                "category": "Audio",
                "stock_quantity": 2,
                "price": 149.99,
                "purchase_price": 95.00,
                "reorder_level": 4,
                "supplier": "AudioHub",
            },
        ]
        PRODUCTS_FILE.write_text(json.dumps(initial_products, indent=2), encoding="utf-8")

    if not SALES_FILE.exists():
        SALES_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")

    if not EXPENSES_FILE.exists():
        EXPENSES_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")

    if not VENDORS_FILE.exists():
        VENDORS_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")

    if not CUSTOMERS_FILE.exists():
        CUSTOMERS_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")

    if not PURCHASE_ORDERS_FILE.exists():
        PURCHASE_ORDERS_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")

    if not STOCK_ADJUSTMENTS_FILE.exists():
        STOCK_ADJUSTMENTS_FILE.write_text(json.dumps([], indent=2), encoding="utf-8")


def normalize_product(product):
    normalized = dict(product)
    normalized["purchase_price"] = float(normalized.get("purchase_price", 0) or 0)
    normalized["price"] = float(normalized.get("price", 0) or 0)
    normalized["stock_quantity"] = int(normalized.get("stock_quantity", 0) or 0)
    normalized["reorder_level"] = int(normalized.get("reorder_level", 0) or 0)
    return normalized


def read_products():
    ensure_data_files()
    products = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
    normalized_products = [normalize_product(product) for product in products]
    if normalized_products != products:
        write_products(normalized_products)
    return normalized_products


def write_products(products):
    PRODUCTS_FILE.write_text(json.dumps(products, indent=2), encoding="utf-8")


def read_sales():
    ensure_data_files()
    return json.loads(SALES_FILE.read_text(encoding="utf-8"))


def write_sales(sales):
    SALES_FILE.write_text(json.dumps(sales, indent=2), encoding="utf-8")


def read_expenses():
    ensure_data_files()
    return json.loads(EXPENSES_FILE.read_text(encoding="utf-8"))


def write_expenses(expenses):
    EXPENSES_FILE.write_text(json.dumps(expenses, indent=2), encoding="utf-8")


def read_vendors():
    ensure_data_files()
    return json.loads(VENDORS_FILE.read_text(encoding="utf-8"))


def write_vendors(vendors):
    VENDORS_FILE.write_text(json.dumps(vendors, indent=2), encoding="utf-8")


def read_customers():
    ensure_data_files()
    return json.loads(CUSTOMERS_FILE.read_text(encoding="utf-8"))


def write_customers(customers):
    CUSTOMERS_FILE.write_text(json.dumps(customers, indent=2), encoding="utf-8")


def read_purchase_orders():
    ensure_data_files()
    return json.loads(PURCHASE_ORDERS_FILE.read_text(encoding="utf-8"))


def write_purchase_orders(orders):
    PURCHASE_ORDERS_FILE.write_text(json.dumps(orders, indent=2), encoding="utf-8")


def read_stock_adjustments():
    ensure_data_files()
    return json.loads(STOCK_ADJUSTMENTS_FILE.read_text(encoding="utf-8"))


def write_stock_adjustments(adjustments):
    STOCK_ADJUSTMENTS_FILE.write_text(json.dumps(adjustments, indent=2), encoding="utf-8")


def build_contact(data, existing=None):
    existing = existing or {}
    return {
        "name": str(data.get("name", existing.get("name", ""))).strip(),
        "email": str(data.get("email", existing.get("email", "")) or "").strip(),
        "phone": str(data.get("phone", existing.get("phone", "")) or "").strip(),
        "address": str(data.get("address", existing.get("address", "")) or "").strip(),
        "notes": str(data.get("notes", existing.get("notes", "")) or "").strip(),
    }


def build_order_items(raw_items, products, price_field, product_price_field):
    items = []
    for raw_item in raw_items or []:
        try:
            product_id = int(raw_item.get("product_id"))
            quantity = int(raw_item.get("quantity", 0) or 0)
        except (TypeError, ValueError):
            raise ValueError("Each item requires a valid product_id and quantity.")

        if quantity <= 0:
            raise ValueError("Item quantity must be greater than zero.")

        product = next((item for item in products if item["id"] == product_id), None)
        if not product:
            raise ValueError(f"Product {product_id} not found.")

        unit_price = raw_item.get(price_field)
        unit_price = float(unit_price) if unit_price not in (None, "") else float(product.get(product_price_field, 0) or 0)

        items.append(
            {
                "product_id": product["id"],
                "product_name": product["name"],
                "sku": product["sku"],
                "quantity": quantity,
                price_field: round(unit_price, 2),
                "line_total": round(unit_price * quantity, 2),
            }
        )
    return items


def get_summary(products):
    total_items = sum(int(product.get("stock_quantity", 0) or 0) for product in products)
    low_stock = sum(
        1
        for product in products
        if int(product.get("stock_quantity", 0) or 0) <= int(product.get("reorder_level", 0) or 0)
    )
    inventory_value = sum(
        int(product.get("stock_quantity", 0) or 0) * float(product.get("price", 0) or 0)
        for product in products
    )
    total_profit = sum(
        int(product.get("stock_quantity", 0) or 0) * (float(product.get("price", 0) or 0) - float(product.get("purchase_price", 0) or 0))
        for product in products
    )
    return {
        "totalItems": total_items,
        "lowStock": low_stock,
        "inventoryValue": round(inventory_value, 2),
        "totalProfit": round(total_profit, 2),
    }


def get_sales_summary(sales):
    total_revenue = sum(float(sale.get("total_price", 0) or 0) for sale in sales)
    total_cost = sum(float(sale.get("total_cost", 0) or 0) for sale in sales)
    total_profit = sum(float(sale.get("profit", 0) or 0) for sale in sales)
    units_sold = sum(int(sale.get("quantity", 0) or 0) for sale in sales)
    return {
        "salesCount": len(sales),
        "unitsSold": units_sold,
        "totalRevenue": round(total_revenue, 2),
        "totalCost": round(total_cost, 2),
        "totalProfit": round(total_profit, 2),
    }


def parse_iso_datetime(value):
    try:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None


def build_reports(sales, expenses):
    daily_sales = {}
    monthly_sales = {}
    weekly_sales = {}

    for sale in sales:
        moment = parse_iso_datetime(sale.get("sold_at"))
        if not moment:
            continue
        day_key = moment.date().isoformat()
        month_key = moment.strftime("%Y-%m")
        iso_year, iso_week, _ = moment.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"

        revenue = float(sale.get("total_price", 0) or 0)
        cost = float(sale.get("total_cost", 0) or 0)
        profit = float(sale.get("profit", 0) or 0)
        units = int(sale.get("quantity", 0) or 0)

        for bucket, key in ((daily_sales, day_key), (monthly_sales, month_key), (weekly_sales, week_key)):
            entry = bucket.setdefault(key, {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "unitsSold": 0})
            entry["revenue"] += revenue
            entry["cost"] += cost
            entry["profit"] += profit
            entry["unitsSold"] += units

    daily_expenses = {}
    monthly_expenses = {}
    weekly_expenses = {}

    for expense in expenses:
        moment = parse_iso_datetime(expense.get("date"))
        if not moment:
            continue
        day_key = moment.date().isoformat()
        month_key = moment.strftime("%Y-%m")
        iso_year, iso_week, _ = moment.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        amount = float(expense.get("amount", 0) or 0)

        for bucket, key in ((daily_expenses, day_key), (monthly_expenses, month_key), (weekly_expenses, week_key)):
            bucket[key] = bucket.get(key, 0.0) + amount

    def sales_rows(bucket, key_name):
        return [
            {
                key_name: key,
                "revenue": round(value["revenue"], 2),
                "cost": round(value["cost"], 2),
                "profit": round(value["profit"], 2),
                "unitsSold": value["unitsSold"],
            }
            for key, value in sorted(bucket.items())
        ]

    def expense_rows(bucket, key_name):
        return [{key_name: key, "total": round(value, 2)} for key, value in sorted(bucket.items())]

    def profit_rows(sales_bucket, expenses_bucket, key_name):
        keys = sorted(set(sales_bucket) | set(expenses_bucket))
        rows = []
        for key in keys:
            sales_profit = round(sales_bucket.get(key, {}).get("profit", 0.0), 2)
            expense_total = round(expenses_bucket.get(key, 0.0), 2)
            rows.append(
                {
                    key_name: key,
                    "salesProfit": sales_profit,
                    "expenses": expense_total,
                    "netProfit": round(sales_profit - expense_total, 2),
                }
            )
        return rows

    return {
        "dailySales": sales_rows(daily_sales, "date"),
        "monthlySales": sales_rows(monthly_sales, "month"),
        "dailyExpenses": expense_rows(daily_expenses, "date"),
        "monthlyExpenses": expense_rows(monthly_expenses, "month"),
        "weeklyProfit": profit_rows(weekly_sales, weekly_expenses, "week"),
        "monthlyProfit": profit_rows(monthly_sales, monthly_expenses, "month"),
    }


def parse_query_params(query):
    params = {}
    for part in (query or "").split("&"):
        if "=" in part:
            key, value = part.split("=", 1)
            params[key] = value
    return params


class InventoryHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, status, path):
        content = path.read_bytes()
        mime_map = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        content_type = mime_map.get(path.suffix.lower(), "application/octet-stream")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
        return json.loads(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_query_params(parsed.query)

        if path.startswith("/api/"):
            if path == "/api/products":
                products = read_products()
                search_query = params.get("search", "").lower()
                category_query = params.get("category", "").lower()
                filtered = []
                for product in products:
                    haystack = " ".join(
                        [
                            product.get("name", ""),
                            product.get("sku", ""),
                            product.get("category", ""),
                            product.get("supplier", ""),
                        ]
                    ).lower()
                    if search_query and search_query not in haystack:
                        continue
                    if category_query and product.get("category", "").lower() != category_query:
                        continue
                    filtered.append(product)
                self._send_json(HTTPStatus.OK, filtered)
                return

            if path == "/api/summary":
                self._send_json(HTTPStatus.OK, get_summary(read_products()))
                return

            if path == "/api/sales":
                sales = read_sales()
                self._send_json(HTTPStatus.OK, list(reversed(sales)))
                return

            if path == "/api/sales-summary":
                self._send_json(HTTPStatus.OK, get_sales_summary(read_sales()))
                return

            if path == "/api/expenses":
                expenses = read_expenses()
                self._send_json(HTTPStatus.OK, list(reversed(expenses)))
                return

            if path == "/api/reports":
                self._send_json(HTTPStatus.OK, build_reports(read_sales(), read_expenses()))
                return

            if path == "/api/vendors":
                self._send_json(HTTPStatus.OK, read_vendors())
                return

            if path == "/api/customers":
                self._send_json(HTTPStatus.OK, read_customers())
                return

            if path == "/api/purchase-orders":
                self._send_json(HTTPStatus.OK, list(reversed(read_purchase_orders())))
                return

            if path == "/api/stock-adjustments":
                self._send_json(HTTPStatus.OK, list(reversed(read_stock_adjustments())))
                return

            if path.startswith("/api/products/"):
                try:
                    product_id = int(path.rsplit("/", 1)[-1])
                except ValueError:
                    self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid product id"})
                    return
                products = read_products()
                product = next((item for item in products if item["id"] == product_id), None)
                if not product:
                    self._send_json(HTTPStatus.NOT_FOUND, {"error": "Product not found"})
                    return
                self._send_json(HTTPStatus.OK, product)
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})
            return

        if path in ["/", ""]:
            index_path = PUBLIC_DIR / "index.html"
            self._send_file(HTTPStatus.OK, index_path)
            return

        requested_path = PUBLIC_DIR / path.lstrip("/")
        if requested_path.exists() and requested_path.is_file():
            self._send_file(HTTPStatus.OK, requested_path)
            return

        self._send_file(HTTPStatus.NOT_FOUND, PUBLIC_DIR / "index.html")

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/products":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            products = read_products()
            new_product = {
                "id": int(max((item["id"] for item in products), default=0)) + 1,
                "name": str(data.get("name", "")).strip(),
                "sku": str(data.get("sku", "")).strip(),
                "category": str(data.get("category", "")).strip(),
                "stock_quantity": int(data.get("stock_quantity", 0) or 0),
                "price": float(data.get("price", 0) or 0),
                "purchase_price": float(data.get("purchase_price", 0) or 0),
                "reorder_level": int(data.get("reorder_level", 0) or 0),
                "supplier": str(data.get("supplier", "") or "Unknown").strip(),
            }

            if not new_product["name"] or not new_product["sku"] or not new_product["category"]:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Name, SKU and category are required."})
                return

            products.append(new_product)
            write_products(products)
            self._send_json(HTTPStatus.CREATED, new_product)
            return

        if parsed.path == "/api/pos/checkout":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            products = read_products()
            try:
                items = build_order_items(data.get("items"), products, "unit_price", "price")
            except ValueError as error:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            if not items:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "The cart is empty."})
                return

            for item in items:
                product = next(p for p in products if p["id"] == item["product_id"])
                if product["stock_quantity"] < item["quantity"]:
                    self._send_json(
                        HTTPStatus.BAD_REQUEST,
                        {"error": f"Insufficient stock for {product['name']}. Only {product['stock_quantity']} unit(s) available."},
                    )
                    return

            customer_name = "Walk-in"
            customer_id = data.get("customer_id")
            if customer_id not in (None, ""):
                customers = read_customers()
                customer = next((item for item in customers if item["id"] == int(customer_id)), None)
                if customer:
                    customer_name = customer["name"]
            elif str(data.get("customer_name", "") or "").strip():
                customer_name = str(data["customer_name"]).strip()

            receipt_number = f"RCPT-{int(datetime.now(timezone.utc).timestamp())}"
            sold_at = datetime.now(timezone.utc).isoformat()

            sales = read_sales()
            next_sale_id = int(max((sale["id"] for sale in sales), default=0))
            receipt_items = []
            for item in items:
                product = next(p for p in products if p["id"] == item["product_id"])
                product["stock_quantity"] -= item["quantity"]
                unit_cost = float(product.get("purchase_price", 0) or 0)
                total_cost = round(unit_cost * item["quantity"], 2)
                profit = round(item["line_total"] - total_cost, 2)
                next_sale_id += 1

                sale_entry = {
                    "id": next_sale_id,
                    "receipt_number": receipt_number,
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "sku": product["sku"],
                    "quantity": item["quantity"],
                    "unit_price": item["unit_price"],
                    "total_price": item["line_total"],
                    "total_cost": total_cost,
                    "profit": profit,
                    "customer": customer_name,
                    "sold_at": sold_at,
                }
                sales.append(sale_entry)
                receipt_items.append(sale_entry)

            write_products(products)
            write_sales(sales)

            subtotal = round(sum(item["line_total"] for item in items), 2)
            payment_method = str(data.get("payment_method", "") or "cash").strip()
            amount_tendered = data.get("amount_tendered")
            amount_tendered = float(amount_tendered) if amount_tendered not in (None, "") else None
            change_due = round(amount_tendered - subtotal, 2) if amount_tendered is not None else None

            receipt = {
                "receipt_number": receipt_number,
                "customer": customer_name,
                "items": receipt_items,
                "subtotal": subtotal,
                "total": subtotal,
                "payment_method": payment_method,
                "amount_tendered": amount_tendered,
                "change_due": change_due,
                "sold_at": sold_at,
            }
            self._send_json(HTTPStatus.CREATED, receipt)
            return

        if parsed.path == "/api/expenses":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            description = str(data.get("description", "") or "").strip()
            amount = float(data.get("amount", 0) or 0)
            if not description or amount <= 0:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Description and a positive amount are required."})
                return

            date_value = str(data.get("date", "") or "").strip()
            expense_date = parse_iso_datetime(date_value) if date_value else datetime.now(timezone.utc)
            if not expense_date:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid date."})
                return

            expenses = read_expenses()
            new_expense = {
                "id": int(max((expense["id"] for expense in expenses), default=0)) + 1,
                "description": description,
                "category": str(data.get("category", "") or "General").strip(),
                "amount": round(amount, 2),
                "date": expense_date.isoformat(),
            }
            expenses.append(new_expense)
            write_expenses(expenses)
            self._send_json(HTTPStatus.CREATED, new_expense)
            return

        if parsed.path == "/api/vendors":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            contact = build_contact(data)
            if not contact["name"]:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Vendor name is required."})
                return

            vendors = read_vendors()
            new_vendor = {"id": int(max((item["id"] for item in vendors), default=0)) + 1, **contact}
            vendors.append(new_vendor)
            write_vendors(vendors)
            self._send_json(HTTPStatus.CREATED, new_vendor)
            return

        if parsed.path == "/api/customers":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            contact = build_contact(data)
            if not contact["name"]:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Customer name is required."})
                return

            customers = read_customers()
            new_customer = {"id": int(max((item["id"] for item in customers), default=0)) + 1, **contact}
            customers.append(new_customer)
            write_customers(customers)
            self._send_json(HTTPStatus.CREATED, new_customer)
            return

        if parsed.path == "/api/purchase-orders":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            try:
                vendor_id = int(data.get("vendor_id"))
            except (TypeError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "vendor_id is required."})
                return

            vendors = read_vendors()
            vendor = next((item for item in vendors if item["id"] == vendor_id), None)
            if not vendor:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Vendor not found"})
                return

            try:
                items = build_order_items(data.get("items"), read_products(), "unit_cost", "purchase_price")
            except ValueError as error:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            if not items:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "At least one item is required."})
                return

            orders = read_purchase_orders()
            next_id = int(max((item["id"] for item in orders), default=0)) + 1
            new_order = {
                "id": next_id,
                "po_number": f"PO-{1000 + next_id}",
                "vendor_id": vendor["id"],
                "vendor_name": vendor["name"],
                "status": "draft",
                "items": items,
                "total": round(sum(item["line_total"] for item in items), 2),
                "notes": str(data.get("notes", "") or "").strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "received_at": None,
            }
            orders.append(new_order)
            write_purchase_orders(orders)
            self._send_json(HTTPStatus.CREATED, new_order)
            return

        if parsed.path.startswith("/api/purchase-orders/") and parsed.path.endswith("/receive"):
            try:
                order_id = int(parsed.path.split("/")[3])
            except (IndexError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid purchase order id"})
                return

            orders = read_purchase_orders()
            order = next((item for item in orders if item["id"] == order_id), None)
            if not order:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Purchase order not found"})
                return
            if order["status"] != "draft":
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Only draft purchase orders can be received."})
                return

            products = read_products()
            for item in order["items"]:
                product = next((p for p in products if p["id"] == item["product_id"]), None)
                if product:
                    product["stock_quantity"] += item["quantity"]
                    product["purchase_price"] = item["unit_cost"]
            write_products(products)

            order["status"] = "received"
            order["received_at"] = datetime.now(timezone.utc).isoformat()
            write_purchase_orders(orders)
            self._send_json(HTTPStatus.OK, order)
            return

        if parsed.path == "/api/stock-adjustments":
            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            try:
                product_id = int(data.get("product_id"))
                quantity_change = int(data.get("quantity_change", 0) or 0)
            except (TypeError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "product_id and quantity_change are required."})
                return

            reason = str(data.get("reason", "") or "").strip()
            if quantity_change == 0 or not reason:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "A non-zero quantity_change and a reason are required."})
                return

            products = read_products()
            product = next((item for item in products if item["id"] == product_id), None)
            if not product:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Product not found"})
                return

            stock_before = product["stock_quantity"]
            stock_after = stock_before + quantity_change
            if stock_after < 0:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Adjustment would result in negative stock."})
                return

            product["stock_quantity"] = stock_after
            write_products(products)

            adjustments = read_stock_adjustments()
            new_adjustment = {
                "id": int(max((item["id"] for item in adjustments), default=0)) + 1,
                "product_id": product["id"],
                "product_name": product["name"],
                "sku": product["sku"],
                "quantity_change": quantity_change,
                "reason": reason,
                "stock_before": stock_before,
                "stock_after": stock_after,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            adjustments.append(new_adjustment)
            write_stock_adjustments(adjustments)
            self._send_json(HTTPStatus.CREATED, new_adjustment)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})

    def do_PUT(self):
        parsed = urlparse(self.path)

        if parsed.path.startswith("/api/products/"):
            try:
                product_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid product id"})
                return

            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            products = read_products()
            product = next((item for item in products if item["id"] == product_id), None)
            if not product:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Product not found"})
                return

            product.update(
                {
                    "name": str(data.get("name", product.get("name", ""))).strip() or product.get("name", ""),
                    "sku": str(data.get("sku", product.get("sku", ""))).strip() or product.get("sku", ""),
                    "category": str(data.get("category", product.get("category", ""))).strip() or product.get("category", ""),
                    "stock_quantity": int(data.get("stock_quantity", product.get("stock_quantity", 0)) or 0),
                    "price": float(data.get("price", product.get("price", 0)) or 0),
                    "purchase_price": float(data.get("purchase_price", product.get("purchase_price", 0)) or 0),
                    "reorder_level": int(data.get("reorder_level", product.get("reorder_level", 0)) or 0),
                    "supplier": str(data.get("supplier", product.get("supplier", "Unknown")) or "Unknown").strip(),
                }
            )
            write_products(products)
            self._send_json(HTTPStatus.OK, product)
            return

        if parsed.path.startswith("/api/vendors/"):
            try:
                vendor_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid vendor id"})
                return

            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            vendors = read_vendors()
            vendor = next((item for item in vendors if item["id"] == vendor_id), None)
            if not vendor:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Vendor not found"})
                return

            vendor.update(build_contact(data, vendor))
            write_vendors(vendors)
            self._send_json(HTTPStatus.OK, vendor)
            return

        if parsed.path.startswith("/api/customers/"):
            try:
                customer_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid customer id"})
                return

            try:
                data = self._read_json_body()
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
                return

            customers = read_customers()
            customer = next((item for item in customers if item["id"] == customer_id), None)
            if not customer:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Customer not found"})
                return

            customer.update(build_contact(data, customer))
            write_customers(customers)
            self._send_json(HTTPStatus.OK, customer)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)

        if parsed.path.startswith("/api/products/"):
            try:
                product_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid product id"})
                return

            products = read_products()
            new_products = [item for item in products if item["id"] != product_id]
            if len(new_products) == len(products):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Product not found"})
                return
            write_products(new_products)
            self._send_json(HTTPStatus.OK, {"success": True})
            return

        if parsed.path.startswith("/api/expenses/"):
            try:
                expense_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid expense id"})
                return

            expenses = read_expenses()
            new_expenses = [item for item in expenses if item["id"] != expense_id]
            if len(new_expenses) == len(expenses):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Expense not found"})
                return
            write_expenses(new_expenses)
            self._send_json(HTTPStatus.OK, {"success": True})
            return

        if parsed.path.startswith("/api/vendors/"):
            try:
                vendor_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid vendor id"})
                return

            vendors = read_vendors()
            new_vendors = [item for item in vendors if item["id"] != vendor_id]
            if len(new_vendors) == len(vendors):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Vendor not found"})
                return
            write_vendors(new_vendors)
            self._send_json(HTTPStatus.OK, {"success": True})
            return

        if parsed.path.startswith("/api/customers/"):
            try:
                customer_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid customer id"})
                return

            customers = read_customers()
            new_customers = [item for item in customers if item["id"] != customer_id]
            if len(new_customers) == len(customers):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Customer not found"})
                return
            write_customers(new_customers)
            self._send_json(HTTPStatus.OK, {"success": True})
            return

        if parsed.path.startswith("/api/purchase-orders/"):
            try:
                order_id = int(parsed.path.rsplit("/", 1)[-1])
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid purchase order id"})
                return

            orders = read_purchase_orders()
            order = next((item for item in orders if item["id"] == order_id), None)
            if not order:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Purchase order not found"})
                return
            if order["status"] != "draft":
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Only draft purchase orders can be deleted."})
                return

            write_purchase_orders([item for item in orders if item["id"] != order_id])
            self._send_json(HTTPStatus.OK, {"success": True})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})


def main():
    ensure_data_files()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), InventoryHandler)
    print(f"Inventory app running at http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
