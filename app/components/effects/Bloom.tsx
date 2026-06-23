import { BlendFunction } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'
import { BloomEffect } from '@/app/modules/effects/BloomEffect'

export const Bloom = /* @__PURE__ */ wrapEffect(BloomEffect, {
  blendFunction: BlendFunction.ADD,
})