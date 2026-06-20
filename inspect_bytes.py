p = r"c:\Users\pujit\OneDrive\Desktop\flipkart hackthon\replit\Traffic-Event-Predictor\Traffic-Event-Predictor\severity_model.pkl"
with open(p,'rb') as f:
    b = f.read(200)
print('len:', len(open(p,'rb').read()))
print('first200:', b)
print('hex:', b.hex()[:400])
for s in [b'PK', b'BZh', b'\x80\x04', b'\x1f\x8b']:
    print(s, b.find(s))
