/*{
  "DESCRIPTION": "A spinning tunnel that pulls you forward into its depths",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "spirals", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord - vec2(0.5);
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  
  float depth = mod(TIME * speed * 0.5 - radius * 3.0, 1.0);
  float spiral = mod(angle * spirals / 6.28318530718 + TIME * speed * 0.3, 1.0);
  
  float innerRing = smoothstep(0.05, 0.0, abs(radius - 0.2));
  float spiralStripe = smoothstep(0.08, 0.0, abs(spiral - 0.5));
  float depthRing = smoothstep(0.1, 0.0, abs(depth - 0.5));
  
  float brightness = max(spiralStripe * depthRing, innerRing);
  brightness *= (1.0 - radius * 1.5);
  brightness = max(brightness, 0.0);
  
  vec3 col = mix(colorA.rgb, colorB.rgb, spiral);
  gl_FragColor = vec4(col * brightness, 1.0);
}
