using Microsoft.MixedReality.Toolkit.Input;
using UnityEngine;

namespace HololensInstruct.Interactions
{
    // Example HoloLens 1 interaction: air-tap (or any MRTK pointer click) cycles the object's color.
    [RequireComponent(typeof(Renderer))]
    public class TapToCycleColor : MonoBehaviour, IMixedRealityPointerHandler
    {
        [SerializeField]
        private Color[] colors =
        {
            Color.red,
            Color.green,
            Color.blue,
        };

        private Renderer targetRenderer;
        private int colorIndex;

        private void Awake()
        {
            targetRenderer = GetComponent<Renderer>();
        }

        public void OnPointerClicked(MixedRealityPointerEventData eventData)
        {
            colorIndex = (colorIndex + 1) % colors.Length;
            targetRenderer.material.color = colors[colorIndex];
        }

        public void OnPointerDown(MixedRealityPointerEventData eventData) { }

        public void OnPointerDragged(MixedRealityPointerEventData eventData) { }

        public void OnPointerUp(MixedRealityPointerEventData eventData) { }
    }
}
