# R8 켠 1.0.11 부터 쓰인다.
# 앱 코드는 리플렉션·직렬화 라이브러리를 쓰지 않는다. 활동·위젯·타일·Health Connect 권한 화면은
# 매니페스트에 적혀 aapt 가 keep 규칙을 만든다. 라이브러리는 자기 consumer 규칙을 싣고 온다.
# 그래서 여기 규칙은 비워 둔다 — 실기기에서 무엇이 깨지면 그때 그 클래스만 더한다.

# 비정상 종료 스택에서 줄 번호를 읽을 수 있게 한다 (mapping.txt 로 되돌린다).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
