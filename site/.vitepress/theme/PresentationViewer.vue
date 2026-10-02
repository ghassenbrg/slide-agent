<script setup lang="ts">
import {computed, ref} from 'vue';
import {withBase} from 'vitepress';
import {presentations} from './showcase';

const props = defineProps<{slug: string}>();
const deck = computed(() => presentations.find(item => item.slug === props.slug)!);
const current = ref(0);
const asset = (index: number) => withBase(`/showcase/presentations/${props.slug}/${String(index + 1).padStart(2, '0')}.png`);
</script>

<template>
	<section class="presentation-viewer" :aria-label="`${deck.title} slide viewer`" @keydown.left.prevent="current = Math.max(0, current - 1)" @keydown.right.prevent="current = Math.min(deck.slides.length - 1, current + 1)">
		<p class="presentation-category">{{ deck.genre }} · {{ deck.slides.length }} slides</p>
		<p>{{ deck.description }}</p>
		<div class="presentation-links presentation-downloads">
			<a :href="withBase(`/showcase/presentations/${slug}/${slug}.pptx`)" download>Download PowerPoint</a>
			<a :href="withBase(`/showcase/presentations/${slug}/${slug}.pdf`)" download>Download PDF</a>
		</div>
		<img class="presentation-main-slide" :src="asset(current)" :alt="`${deck.title}: ${deck.slides[current]}`" width="1600" height="900" />
		<div class="presentation-controls">
			<button type="button" :disabled="current === 0" @click="current--">← Previous</button>
			<p aria-live="polite" aria-atomic="true">{{ current + 1 }} / {{ deck.slides.length }} · {{ deck.slides[current] }}</p>
			<button type="button" :disabled="current === deck.slides.length - 1" @click="current++">Next →</button>
		</div>
		<div class="presentation-thumbnails" aria-label="Choose a slide">
			<button v-for="(title, index) in deck.slides" :key="title" type="button" :aria-label="`Slide ${index + 1}: ${title}`" :aria-current="current === index ? 'true' : undefined" @click="current = index">
				<img :src="asset(index)" alt="" width="1600" height="900" loading="lazy" />
				<span>{{ index + 1 }}. {{ title }}</span>
			</button>
		</div>
		<p class="presentation-demo-note">Fictional demonstration content. Previews are rendered from the editable PowerPoint.</p>
	</section>
</template>
