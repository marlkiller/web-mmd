#include <common>

#ifdef FRAMEBUFFER_PRECISION_HIGH

	uniform mediump sampler2D inputBuffer;

#else

	uniform lowp sampler2D inputBuffer;

#endif

#ifdef RANGE

	uniform vec2 range;

#elif defined(THRESHOLD)

	uniform float threshold;
	uniform float smoothing;

#endif

varying vec2 vUv;
uniform vec2 texelSize;

void main() {

    vec4 offset0 = vec4(-1,0,1,0) * texelSize.xyxy;
	vec4 offset1 = vec4(0,-1,0,1) * texelSize.xyxy;

    vec4 coord2 = vUv.xyxy + offset0;
    vec4 coord3 = vUv.xyxy + offset1;

    vec4 color = texture2D(inputBuffer, vUv);
	color = min(color, texture2D(inputBuffer, coord2.xy));
	color = min(color, texture2D(inputBuffer, coord2.zw));
	color = min(color, texture2D(inputBuffer, coord3.xy));
	color = min(color, texture2D(inputBuffer, coord3.zw));

	float l = luminance(color.rgb);
	float mask = 1.0;

	#ifdef RANGE

		// Apply a luminance range mask.
		float low = step(range.x, l);
		float high = step(l, range.y);
		mask = low * high;

	#elif defined(THRESHOLD)

		// Apply a high pass filter.
		mask = smoothstep(threshold, threshold + smoothing, l);

	#endif

	#ifdef COLOR

		gl_FragColor = color * mask;

	#else

		gl_FragColor = vec4(l * mask);

	#endif

}