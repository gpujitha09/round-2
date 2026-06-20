import pickle, os, sys
p = os.path.join(os.path.dirname(__file__), 'severity_model.pkl')
print('inspect path:', p)
if not os.path.exists(p):
    print('file not found', p)
    sys.exit(2)
try:
    with open(p,'rb') as fh:
        try:
            model = pickle.load(fh)
        except Exception as e1:
            print('pickle.load failed:', type(e1).__name__, e1)
            try:
                import joblib
                fh.seek(0)
                model = joblib.load(fh)
                print('loaded with joblib')
            except Exception as e2:
                print('joblib.load failed:', type(e2).__name__, e2)
                try:
                    fh.seek(0)
                    u = pickle.Unpickler(fh)
                    u.encoding = 'latin1'
                    model = u.load()
                    print('loaded with Unpickler(encoding=latin1)')
                except Exception as e3:
                    print('Unpickler fallback failed:', type(e3).__name__, e3)
                    raise
except Exception as e:
    print('ERROR unpickling:', type(e).__name__, e)
    sys.exit(3)
print('loaded type:', type(model))
try:
    import lightgbm as lgb
    print('lightgbm version:', lgb.__version__)
    print('is LGBMClassifier:', isinstance(model, lgb.sklearn.LGBMClassifier))
except Exception as e:
    print('lightgbm not available in this interpreter:', e)
try:
    params = model.get_params()
    print('get_params count:', len(params))
except Exception as e:
    print('get_params failed:', e)
try:
    fi = getattr(model, 'feature_importances_', None)
    print('feature_importances present:', fi is not None)
    if fi is not None:
        print('len(feature_importances)=', len(fi))
except Exception as e:
    print('feature_importances access error:', e)
print('repr snippet:', repr(model)[:1000])
