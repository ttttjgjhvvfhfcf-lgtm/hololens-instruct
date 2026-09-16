using System;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Input;

namespace SimpleBrowser
{
    public sealed partial class MainPage : Page
    {
        private const string HomeUri = "https://www.bing.com";

        public MainPage()
        {
            InitializeComponent();
            Browser.NavigationStarting += Browser_NavigationStarting;
            Browser.NavigationCompleted += Browser_NavigationCompleted;
            Navigate(HomeUri);
        }

        private void Navigate(string address)
        {
            if (Uri.TryCreate(NormalizeAddress(address), UriKind.Absolute, out Uri uri))
            {
                Browser.Navigate(uri);
            }
        }

        private static string NormalizeAddress(string address)
        {
            address = address.Trim();
            if (!address.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !address.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                address = "https://" + address;
            }
            return address;
        }

        private void Browser_NavigationStarting(WebView sender, WebViewNavigationStartingEventArgs args)
        {
            AddressBar.Text = args.Uri?.ToString() ?? AddressBar.Text;
        }

        private void Browser_NavigationCompleted(WebView sender, WebViewNavigationCompletedEventArgs args)
        {
            BackButton.IsEnabled = Browser.CanGoBack;
            ForwardButton.IsEnabled = Browser.CanGoForward;
        }

        private void GoButton_Click(object sender, RoutedEventArgs e)
        {
            Navigate(AddressBar.Text);
        }

        private void AddressBar_KeyDown(object sender, KeyRoutedEventArgs e)
        {
            if (e.Key == Windows.System.VirtualKey.Enter)
            {
                Navigate(AddressBar.Text);
            }
        }

        private void BackButton_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CanGoBack) Browser.GoBack();
        }

        private void ForwardButton_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CanGoForward) Browser.GoForward();
        }

        private void ReloadButton_Click(object sender, RoutedEventArgs e)
        {
            Browser.Refresh();
        }

        private void HomeButton_Click(object sender, RoutedEventArgs e)
        {
            Navigate(HomeUri);
        }
    }
}
