<script setup lang="ts">
import {withBase} from 'vitepress';
import {presentations} from './showcase';
</script>

<template>
	<div class="presentation-gallery">
		<article v-for="deck in presentations" :key="deck.slug" class="presentation-card">
			<a :href="withBase(`/showcase/${deck.slug}`)" class="presentation-preview" :aria-label="`View ${deck.title}: five-slide presentation`">
				<img :src="withBase(`/showcase/presentations/${deck.slug}/01.png`)" :alt="`${deck.title} — ${deck.slides[0]}`" width="1600" height="900" loading="lazy" />
			</a>
			<div class="presentation-card-copy">
				<p class="presentation-category">{{ deck.genre }} <span>· 5 slides</span></p>
				<h3><a :href="withBase(`/showcase/${deck.slug}`)">{{ deck.title }}</a></h3>
				<p>{{ deck.description }}</p>
				<div class="presentation-links">
					<a :href="withBase(`/showcase/${deck.slug}`)">View presentation →</a>
					<a :href="withBase(`/showcase/presentations/${deck.slug}/${deck.slug}.pptx`)" download :aria-label="`Download ${deck.title} PowerPoint`">PPTX</a>
					<a :href="withBase(`/showcase/presentations/${deck.slug}/${deck.slug}.pdf`)" download :aria-label="`Download ${deck.title} PDF`">PDF</a>
				</div>
			</div>
		</article>
	</div>
</template>
