<script setup lang="ts">
const props = defineProps({
  translationPath: { type: String, required: true }
})

const attrs = useAttrs()
const { t } = useI18n()
const { $sanitize } = useNuxtApp()

const textToDisplay = computed(() => {
  const translationProps = {
    ...attrs,
    boldStart: '<strong>',
    boldEnd: '</strong>'
  }
  return $sanitize(t(props.translationPath, translationProps))
})
</script>
<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span v-html="textToDisplay" />
</template>
