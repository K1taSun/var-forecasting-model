import uvicorn
import os
import sys

# Dodaj bieżący katalog do sys.path, aby można było znaleźć pakiet 'app'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("Starting VAR Forecasting Model Backend Server...")
    print("API will be accessible at http://127.0.0.1:8000")
    print("Interactive Documentation (Swagger UI) at http://127.0.0.1:8000/docs")
    
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )
