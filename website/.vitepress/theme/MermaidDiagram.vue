<script setup>
import { onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({ code: { type: String, required: true } })
const { isDark } = useData()
const svg = ref('')
const error = ref('')
let revision = 0

async function render() {
  const current = ++revision
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark.value ? 'dark' : 'default' })
    const id = `diagram-${crypto.randomUUID()}`
    const result = await mermaid.render(id, props.code)
    if (current === revision) {
      svg.value = result.svg
      error.value = ''
    }
  } catch {
    error.value = 'Diagram could not be rendered. The source is shown below.'
  }
}

onMounted(() => {
  render()
  watch([() => props.code, isDark], render)
})
</script>

<template>
  <figure class="mermaid-diagram" aria-label="Architecture diagram">
    <div v-if="svg && !error" v-html="svg" />
    <template v-else>
      <p v-if="error" role="status">{{ error }}</p>
      <pre><code>{{ code }}</code></pre>
    </template>
  </figure>
</template>
