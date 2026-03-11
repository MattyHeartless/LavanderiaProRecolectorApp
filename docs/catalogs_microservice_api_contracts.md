# API Contracts - Catalogs Microservice

**Base URL:** `http://localhost:5009`

## Services
### 1. GET /api/Catalogs/services
**Response:**
```json
{
  "services": [
    {
      "id": "2ebf6c25-8d20-4a64-e809-08de68dc01f2",
      "name": "Lavado y secado",
      "description": "Servicio paquete de lavado de ropa y secado",
      "price": 35,
      "uoM": "KG",
      "isActive": false,
      "icon": "local_laundry_service",
      "themeIcon": "w-12 h-12 bg-soft-blue rounded-xl flex items-center justify-center text-mint-dark"
    }
  ]
}
```

### 2. POST /api/Catalogs/services
**Request:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "string",
  "description": "string",
  "price": 0,
  "uoM": "string",
  "isActive": true,
  "icon": "string",
  "themeIcon": "string"
}
```
**Response:**
```json
{
  "message": "Service added successfully",
  "data": {}
}
```

### 3. GET /api/Catalogs/services/{id}
**Response:**
```json
{
  "service": {
    "id": "2ebf6c25-8d20-4a64-e809-08de68dc01f2",
    "name": "Lavado y secado",
    "description": "Servicio paquete de lavado de ropa y secado",
    "price": 35,
    "uoM": "KG",
    "isActive": false,
    "icon": "local_laundry_service",
    "themeIcon": "w-12 h-12 bg-soft-blue rounded-xl flex items-center justify-center text-mint-dark"
  }
}
```

### 4. PUT /api/Catalogs/services/{id}
**Request:** (Similar to POST)
**Response:**
```json
{
  "message": "Service updated successfully",
  "data": {}
}
```

### 5. DELETE /api/Catalogs/services/{id}
**Response:**
```json
{
  "message": "Service deleted successfully",
  "success": true
}
```

## Couriers
### 6. GET /api/Catalogs/couriers
**Response:**
```json
{
  "couriers": [
    {
      "id": "27a347c0-44b0-4549-8876-7e31a2c0ebf1",
      "name": "Ernesto",
      "middleName": "Padilla",
      "lastName": "Soza",
      "vehicle": "Bicicleta",
      "address": "Getzemani #2938",
      "neighborhood": "Hermosa Provincia",
      "zipCode": "44770",
      "city": "Guadalajara",
      "phoneNumber": "3319485766",
      "isActive": true
    }
  ]
}
```

### 7. POST /api/Catalogs/couriers
**Request:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "string",
  "middleName": "string",
  "lastName": "string",
  "vehicle": "string",
  "address": "string",
  "neighborhood": "string",
  "zipCode": "string",
  "city": "string",
  "phoneNumber": "string",
  "isActive": true
}
```
**Response:**
```json
{
  "message": "Courier added successfully",
  "data": {}
}
```

### 8. GET /api/Catalogs/couriers/{id}
**Response:**
```json
{
  "courier": {
    "id": "27a347c0-44b0-4549-8876-7e31a2c0ebf1",
    "name": "Ernesto",
    "middleName": "Padilla",
    "lastName": "Soza",
    "vehicle": "Bicicleta",
    "address": "Getzemani #2938",
    "neighborhood": "Hermosa Provincia",
    "zipCode": "44770",
    "city": "Guadalajara",
    "phoneNumber": "3319485766",
    "isActive": true
  }
}
```

### 9. PUT /api/Catalogs/couriers/{id}
**Request:** (Similar to POST)
**Response:**
```json
{
  "message": "Courier updated successfully",
  "data": {}
}
```

### 10. DELETE /api/Catalogs/couriers/{id}
**Response:**
```json
{
  "message": "Courier deleted successfully",
  "success": true
}
```
