// 脚手架自带的计数器示例 Store，仅作 Pinia 用法演示，业务上未使用
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubleCount = computed(() => count.value * 2)
  /** 计数加一 */
  function increment() {
    count.value++
  }

  return { count, doubleCount, increment }
})
