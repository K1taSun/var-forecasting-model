import sys
import os
sys.path.append(os.getcwd())
from backend.modeling import ModelManager
import numpy as np

mm = ModelManager()
mm.build_var()
print("Variables order:", mm.variables)
if mm.var_result:
    print("Coefficients for lag 1 (Wages -> Wages):", mm.var_result.coefs[0, 0, 0])
    print("Coefficients for lag 1 (Inflation -> Inflation):", mm.var_result.coefs[0, 2, 2])

    # Test symulacji szoku
    shocks = {"it_earnings": 1000}
    forecast = mm.simulate_shock(shocks, steps=3)
    print("Forecast after +1000 IT Earnings shock (first 3 steps):")
    for row in forecast:
         print(row)
