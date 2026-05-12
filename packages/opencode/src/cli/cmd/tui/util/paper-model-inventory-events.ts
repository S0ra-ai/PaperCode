const paperModelInventoryTarget = new EventTarget()

export function notifyPaperModelInventoryChanged() {
  paperModelInventoryTarget.dispatchEvent(new Event("paper-model-inventory.changed"))
}

export function subscribePaperModelInventoryChanged(listener: () => void) {
  const handler = () => listener()
  paperModelInventoryTarget.addEventListener("paper-model-inventory.changed", handler)
  return () => paperModelInventoryTarget.removeEventListener("paper-model-inventory.changed", handler)
}
