#!/bin/bash
# Управление приложением на эмуляторе для смоук-теста и скриншотов (шаг 5).
# Запуск из папки проекта в git-bash:
#   bash tools/emu.sh open                 # перезапустить Expo Go и открыть проект с Metro :8081
#   bash tools/emu.sh tap "Add groceries"  # тап по точному text/content-desc (accessibilityLabel)
#   bash tools/emu.sh tap "Decrease" 2     # ...второе совпадение
#   bash tools/emu.sh tapre "^Add (to pantry|[0-9]+ packs)"   # тап по регулярке
#   bash tools/emu.sh texts                # все тексты/подписи на экране
#   bash tools/emu.sh shot name            # скриншот в .emu/name.png (для просмотра)
#   bash tools/emu.sh creo 3               # скриншот сразу в release/creo/3.png
#   bash tools/emu.sh swipe 540 1900 540 300 [ms]   # скролл/свайп; долгий тап = свайп в ту же точку 900ms
#   bash tools/emu.sh back
# Подводные камни:
#   • "back" на корневом экране закрывает Expo Go — дальше снова "open";
#   • Metro на Windows иногда не видит правки, сделанные скриптами (node -e/sed),
#     — после них "open" (force-stop + повторный запуск), а не надежда на fast refresh;
#   • пути вида /sdcard в git-bash портятся без MSYS_NO_PATHCONV=1 (выставлено ниже).
export MSYS_NO_PATHCONV=1
ADB="/d/Programering/dev-deps/android-sdk/platform-tools/adb.exe"
NODE="/d/Programering/всё для зависимостей/node/node-v24.16.0-win-x64/node.exe"
# Пути для Windows-node — в виде D:/..., иначе при MSYS_NO_PATHCONV=1 node получит /d/... и не найдёт файл.
DIR="$(pwd -W 2>/dev/null || pwd)/.emu"
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
mkdir -p "$DIR"

# Дамп иерархии. Если на экране идёт БЕСКОНЕЧНАЯ анимация, uiautomator не
# дожидается покоя и молча не пишет файл — без удаления старого скрипт читал бы
# дамп с прошлого экрана (так "texts" однажды вернул экран другого приложения).
dump() {
  "$ADB" shell rm -f /sdcard/ui.xml
  out=$("$ADB" shell uiautomator dump /sdcard/ui.xml 2>&1)
  if ! echo "$out" | grep -q "dumped"; then
    echo "UI DUMP FAILED (бесконечная анимация на экране?): $out" >&2
    : > "$DIR/ui.xml"
    return
  fi
  "$ADB" exec-out cat /sdcard/ui.xml > "$DIR/ui.xml"
}

case "$1" in
  open)
    "$ADB" shell am force-stop host.exp.exponent
    sleep 1
    "$ADB" shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:${2:-8081}" host.exp.exponent >/dev/null
    echo "opened exp://10.0.2.2:${2:-8081} — дай ~15-20 с на бандл";;
  tap|tapre)
    dump
    mode=$([ "$1" = "tapre" ] && echo re || echo exact)
    xy=$("$NODE" "$HERE/emu-find.js" "$DIR/ui.xml" "$2" "${3:-1}" "$mode")
    if [ -z "$xy" ]; then echo "NOT FOUND: $2"; exit 1; fi
    "$ADB" shell input tap $xy; echo "tap $2 @ $xy";;
  texts)
    dump
    grep -oE '(text|content-desc)="[^"]+"' "$DIR/ui.xml" | sort -u;;
  shot)
    "$ADB" exec-out screencap -p > "$DIR/$2.png"; echo "$DIR/$2.png";;
  creo)
    mkdir -p release/creo
    "$ADB" exec-out screencap -p > "release/creo/$2.png"; echo "release/creo/$2.png";;
  swipe)
    "$ADB" shell input swipe $2 $3 $4 $5 ${6:-300};;
  back)
    "$ADB" shell input keyevent 4;;
  *)
    sed -n '2,20p' "$0";;
esac
