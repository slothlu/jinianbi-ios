# -*- coding: utf-8 -*-
# 重打 iOS Pro v1.0.4 源码 zip
import zipfile, os

base = r"D:\AndroidBuild\路面纪念钞币科技-Pro版\iOSApp源码"
out = r"D:\AndroidBuild\路面纪念钞币科技-Pro版\路面纪念钞币科技-Pro版-iOS独立App源码-v1.0.4.zip"

count = 0
total = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(base):
        # 跳过构建产物/系统目录
        dirs[:] = [d for d in dirs if d not in (".git", "build", "DerivedData", ".gradle", "__pycache__")]
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, base)
            z.write(p, rel)
            count += 1
            total += os.path.getsize(p)
print("entries:", count, "total bytes:", total, "->", out, os.path.getsize(out))
