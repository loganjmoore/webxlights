/*{
  "DESCRIPTION": "Warm candle flicker with dancing flame effect",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "baseColor", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "flickerSpeed", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 },
    { "NAME": "flickerAmount", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "warmthShift", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float flicker1 = sin(TIME * flickerSpeed * 0.7 + uv.y * 3.0) * 0.5 + 0.5;
  float flicker2 = sin(TIME * flickerSpeed * 1.3 + uv.x * 2.0 - uv.y * 4.0) * 0.5 + 0.5;
  float flicker3 = sin(TIME * flickerSpeed * 0.5 + uv.y * 1.5 + uv.x) * 0.5 + 0.5;
  
  float combined = flicker1 * 0.4 + flicker2 * 0.35 + flicker3 * 0.25;
  combined = smoothstep(0.2, 0.8, combined);
  
  float vignette = 1.0 - length(uv - vec2(0.5, 0.3)) * 0.8;
  vignette = max(0.0, vignette);
  
  float intensity = 0.5 + flickerAmount * combined * 0.5;
  intensity *= (1.0 + vignette * 0.5);
  
  vec3 color = baseColor.rgb;
  color += vec3(warmthShift * 0.3, warmthShift * 0.1, 0.0);
  
  float alpha = intensity * vignette * baseColor.a;
  gl_FragColor = vec4(color * intensity, 1.0);
}
