import streamlit as st
import pandas as pd
import numpy as np

# アプリのタイトルを設定
st.title('Databricks Apps上のシンプルなStreamlitアプリ')

# サイドバーにスライダーを追加
st.sidebar.header('パラメータ設定')
number = st.sidebar.slider('数値を選択してください', 0, 100, 50)

# メイン部分のコンテンツ
st.header('サンプルデータ表示')
st.write(f'選択された値: {number}')

# サンプルデータの作成とプロット
data = pd.DataFrame(
    np.random.randn(number, 3),
    columns=['A', 'B', 'C']
)

st.subheader('データテーブル')
st.dataframe(data)

st.subheader('ラインチャート')
st.line_chart(data)

st.subheader('エリアチャート')
st.area_chart(data)

# インタラクティブな機能
if st.button('新しいデータを生成'):
    st.experimental_rerun()