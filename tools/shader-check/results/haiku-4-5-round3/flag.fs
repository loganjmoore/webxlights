/*{
  "DESCRIPTION": "American flag waving with stars and stripes",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveAmount", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float waveY = sin(uv.x * 6.28318 + TIME * speed) * waveAmount * 0.2;
  float distortedY = uv.y + waveY;
  
  vec3 color = vec3(0.0);
  
  if (distortedY < 0.0 || distortedY > 1.0) {
    color = vec3(0.0);
  } else if (distortedY < 0.077) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.154) {
    color = vec3(1.0, 1.0, 1.0);
  } else if (distortedY < 0.231) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.308) {
    color = vec3(1.0, 1.0, 1.0);
  } else if (distortedY < 0.385) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.462) {
    color = vec3(1.0, 1.0, 1.0);
  } else if (distortedY < 0.539) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.616) {
    color = vec3(1.0, 1.0, 1.0);
  } else if (distortedY < 0.693) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.77) {
    color = vec3(1.0, 1.0, 1.0);
  } else if (distortedY < 0.847) {
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedY < 0.924) {
    color = vec3(1.0, 1.0, 1.0);
  } else {
    color = vec3(1.0, 0.0, 0.0);
  }
  
  if (uv.x < 0.4 && distortedY < 0.539) {
    color = vec3(0.0, 0.0, 0.4);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
