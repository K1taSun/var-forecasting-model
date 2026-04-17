import streamlit as st
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from statsmodels.tsa.api import VAR

st.title("Aplikacja: Prognozowanie VAR")

st.write("Podaj kilka dni danych, reszta zostanie wygenerowana automatycznie")

# ile dni użytkownik wpisuje
manual_days = st.slider("Ile dni wpisujesz ręcznie", 5, 20, 10)

# ile dni ma mieć cały dataset
total_days = st.slider("Łączna liczba dni", 20, 100, 40)

data = []

# 🔹 dane od użytkownika
st.subheader("Dane ręczne")
for i in range(manual_days):
    col1, col2, col3 = st.columns(3)

    sales = col1.number_input(f"Sprzedaż {i+1}", value=100.0 + i*5, key=f"s{i}")
    temp = col2.number_input(f"Temperatura {i+1}", value=20.0 + i*0.5, key=f"t{i}")
    marketing = col3.number_input(f"Marketing {i+1}", value=5.0 + (i%3), key=f"m{i}")

    data.append([sales, temp, marketing])

# BUTTON
if st.button("Uruchom prognozę"):

    df = pd.DataFrame(data, columns=["sales", "temperature", "marketing"])

    # 🔥 GENEROWANIE RESZTY DANYCH
    extra_days = total_days - manual_days

    if extra_days > 0:
        last_sales = df["sales"].iloc[-1]
        last_temp = df["temperature"].iloc[-1]

        for i in range(extra_days):
            new_sales = last_sales + np.random.randint(-5, 10)
            new_temp = last_temp + np.random.uniform(-1, 1)
            new_marketing = np.random.randint(3, 10)

            df.loc[len(df)] = [new_sales, new_temp, new_marketing]

            last_sales = new_sales
            last_temp = new_temp

    # indeks dat
    dates = pd.date_range(start="2026-01-01", periods=len(df))
    df.index = dates

    train_size = int(len(df) * 0.8)
    train = df.iloc[:train_size]
    test = df.iloc[train_size:]

    # sprawdzenie danych
    if train.nunique().min() <= 1:
        st.error("Dane są stałe! Zmień wartości.")
    else:
        model = VAR(train)
        model_fit = model.fit(maxlags=2, trend='n')

        lag_order = model_fit.k_ar

        forecast = model_fit.forecast(train.values[-lag_order:], steps=len(test))
        predictions = pd.DataFrame(forecast, index=test.index, columns=df.columns)

        # przyszłość
        future = model_fit.forecast(df.values[-lag_order:], steps=5)
        future_dates = pd.date_range(df.index[-1], periods=6, freq="D")[1:]
        future_df = pd.DataFrame(future, index=future_dates, columns=df.columns)

        # wykres
        fig, ax = plt.subplots(figsize=(10,5))

        ax.plot(df.index, df["sales"], label="Dane")
        ax.plot(predictions.index, predictions["sales"], label="Predykcja")
        ax.plot(future_df.index, future_df["sales"], label="Przyszłość")

        ax.legend()
        ax.set_title("Prognoza sprzedaży (VAR)")
        ax.grid()

        st.pyplot(fig)

        st.success("Prognoza wygenerowana!")