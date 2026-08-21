/*{
  "DESCRIPTION": "Rotating candy cane stripes in red and white with twinkling accents",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripeWidth", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "twinkle", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float angle = atan(uv.y - 0.5, uv.x - 0.5);
  float wave = sin(angle * 6.0 + TIME * speed * 2.0) * 0.5 + 0.5;
  
  float stripes = mod(uv.x * 8.0 + TIME * speed * 0.5, stripeWidth * 2.0);
  float band = step(stripeWidth, stripes);
  
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, band);
  
  float sparkle = fract(sin(uv.x * 12.0 + uv.y * 8.0 + TIME * speed * 3.0) * 43758.5453);
  sparkle = smoothstep(0.0, 0.1, sparkle) * smoothstep(1.0, 0.9, sparkle);
  
  vec3 finalColor = mix(baseColor, vec3(1.0), sparkle * twinkle);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
